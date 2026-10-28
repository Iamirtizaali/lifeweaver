import type { Memory, Story } from "@/lib/types";
import { shownDescription, truncate } from "./utils";

export interface TimelineEvent {
  memory: Memory;
  /** YYYY-MM-DD from the memory itself (user-entered or chat timestamp); null = undated, never guessed. */
  date: string | null;
  heading: string;
  excerpt: string;
  /** Headings of the story sections that cite this memory. */
  sections: string[];
}

/**
 * Derives timeline events from the story's sources: one card per source memory, dated
 * items in order, undated items last. Story text supplies the headings that cite each one.
 */
export function buildTimeline(story: Story, byId: Map<string, Memory>): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const sid of story.sourceIds) {
    const m = byId.get(sid);
    if (!m) continue;
    const citing = story.sections.filter((sec) => sec.sourceIds.includes(sid) || sec.imageIds.includes(sid));
    const fromChat = m.title?.startsWith("Chat:");
    const text = m.kind === "photo" ? shownDescription(m) || m.note || "" : (m.note ?? "").replace(/^\[\d{4}-\d{2}-\d{2}\]\n/, "");
    events.push({
      memory: m,
      date: m.date,
      heading: citing[0]?.heading || (fromChat ? "Conversation" : m.title || (m.kind === "photo" ? "Photo" : "Memory")),
      excerpt: truncate(text.trim(), 220),
      sections: citing.map((sec) => sec.heading),
    });
  }
  return events.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || a.memory.createdAt.localeCompare(b.memory.createdAt);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.memory.createdAt.localeCompare(b.memory.createdAt);
  });
}
