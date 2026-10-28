import { NextResponse } from "next/server";
import { z } from "zod";
import { boundChat } from "@/lib/chat";
import { getMemoriesByIds, insertStory, listStories } from "@/lib/db";
import { gemmaConfig, writeStory, type StorySource } from "@/lib/gemma";
import { fail, handleError } from "@/lib/http";
import { LIMITS, type StorySection, type TimelineEvent } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  memoryIds: z.array(z.string().uuid()).min(1).max(LIMITS.maxStorySources),
  storyType: z.enum(["trip", "friendship", "family", "custom"]).default("custom"),
  theme: z.string().trim().max(LIMITS.maxThemeChars).default(""),
  instruction: z.string().trim().max(LIMITS.maxInstructionChars).nullish(),
  tone: z.enum(["warm", "plain", "reflective"]).default("warm"),
  length: z.enum(["short", "medium"]).default("short"),
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    return NextResponse.json({ stories: listStories() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    const theme = body.theme || { trip: "Our trip", friendship: "Our friendship", family: "Family moments", custom: "My story" }[body.storyType];

    // Eligibility is enforced in code before the prompt is built:
    // the memory must still exist, be included, and (for photos) have a finished analysis.
    const eligible = getMemoriesByIds([...new Set(body.memoryIds)])
      .filter((m) => m.included && (m.kind !== "photo" || m.status === "ready"))
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.createdAt.localeCompare(b.createdAt));
    if (!eligible.length)
      return fail(400, "invalid_input", "None of the selected memories are eligible. Analyze photos first and make sure they are included.");

    const sources: StorySource[] = eligible.map((m) => ({
      id: m.id,
      kind: m.kind,
      date: m.date,
      title: m.title,
      visualDescription: m.kind === "photo" ? (m.userDescription ?? m.description) : null,
      text: m.note ? (m.kind === "chat" ? boundChat(m.note, LIMITS.chatCharsToModel) : m.note) : null,
      contextAnswer: m.answer,
      people: m.people,
      location: m.location,
    }));

    const out = await writeStory({ ...body, theme, instruction: body.instruction ?? null }, sources);

    // Validate every referenced id against the allowed set; drop anything else.
    const allowed = new Set(eligible.map((m) => m.id));
    const photos = new Set(eligible.filter((m) => m.kind === "photo").map((m) => m.id));
    const keep = (ids: string[], set: Set<string>) => [...new Set(ids.filter((id) => set.has(id)))];

    const sections: StorySection[] = out.sections
      .map((s) => {
        const imageIds = keep(s.imageIds, photos);
        // A photo shown in a section is one of its sources.
        return { heading: s.heading, text: s.text, sourceIds: keep([...s.sourceIds, ...imageIds], allowed), imageIds };
      })
      .filter((s) => s.sourceIds.length > 0);
    if (!sections.length) return fail(502, "model_error", "Gemma's story did not reference any of the selected memories. Try again.");

    // Dates must come from a cited source; otherwise the event is marked undated.
    const sourceDates = new Map(eligible.map((m) => [m.id, m]));
    const chatText = eligible.map((m) => m.note ?? "").join("\n");
    const timeline: TimelineEvent[] = out.timeline
      .map((e) => {
        const sourceIds = keep([...e.sourceIds, ...e.imageIds], allowed);
        const date = e.date && ISO.test(e.date) && sourceIds.some((id) => sourceDates.get(id)?.date === e.date || (sourceDates.get(id)?.note ?? "").includes(e.date!)) ? e.date : null;
        const excerpt = e.excerpt && chatText.includes(e.excerpt.trim()) ? e.excerpt.trim() : null; // verbatim only
        return { date, label: e.label, description: e.description, excerpt, sourceIds, imageIds: keep(e.imageIds, photos) };
      })
      .filter((e) => e.sourceIds.length > 0)
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

    const story = insertStory({
      title: out.title,
      intro: out.intro,
      theme,
      tone: body.tone,
      length: body.length,
      storyType: body.storyType,
      instruction: body.instruction ?? null,
      sections,
      timeline,
      sourceIds: [...new Set([...sections, ...timeline].flatMap((s) => s.sourceIds))],
      model: gemmaConfig().model,
    });
    return NextResponse.json({ story }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
