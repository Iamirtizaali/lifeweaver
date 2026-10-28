import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemoriesByIds, insertStory, listStories } from "@/lib/db";
import { gemmaConfig, writeStory, type StorySource } from "@/lib/gemma";
import { fail, handleError } from "@/lib/http";
import { LIMITS, type StorySection } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  memoryIds: z.array(z.string().uuid()).min(1).max(LIMITS.maxStorySources),
  theme: z.string().trim().min(3).max(LIMITS.maxThemeChars),
  tone: z.enum(["warm", "plain", "reflective"]).default("warm"),
  length: z.enum(["short", "medium"]).default("short"),
});

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

    // Eligibility is enforced in code before the prompt is built:
    // the memory must still exist, be included, and (for photos) have a finished analysis.
    const eligible = getMemoriesByIds([...new Set(body.memoryIds)])
      .filter((m) => m.included && (m.kind === "text" || m.status === "ready"))
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.createdAt.localeCompare(b.createdAt));
    if (!eligible.length)
      return fail(400, "invalid_input", "None of the selected memories are eligible. Analyze photos first and make sure they are included.");

    const sources: StorySource[] = eligible.map((m) => ({
      id: m.id,
      kind: m.kind,
      date: m.date,
      title: m.title,
      visualDescription: m.kind === "photo" ? (m.userDescription ?? m.description) : null,
      note: m.note,
      contextQuestion: m.answer ? m.question : null,
      contextAnswer: m.answer,
      people: m.people,
      location: m.location,
    }));

    const out = await writeStory(body, sources);

    // Validate every referenced id against the allowed set; drop anything else.
    const allowed = new Set(eligible.map((m) => m.id));
    const photos = new Set(eligible.filter((m) => m.kind === "photo").map((m) => m.id));
    const sections: StorySection[] = out.sections
      .map((s) => ({
        heading: s.heading,
        text: s.text,
        sourceIds: [...new Set(s.sourceIds.filter((id) => allowed.has(id)))],
        imageIds: [...new Set(s.imageIds.filter((id) => photos.has(id)))],
      }))
      .filter((s) => s.sourceIds.length > 0);
    if (!sections.length) return fail(502, "model_error", "Gemma's story did not reference any of the selected memories. Try again.");

    const story = insertStory({
      title: out.title,
      intro: out.intro,
      theme: body.theme,
      tone: body.tone,
      length: body.length,
      sections,
      sourceIds: [...new Set(sections.flatMap((s) => s.sourceIds))],
      model: gemmaConfig().model,
    });
    return NextResponse.json({ story }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
