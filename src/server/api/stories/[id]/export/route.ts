import { getMemoriesByIds, getStory } from "@/lib/db";
import { fail, type IdCtx } from "@/lib/http";

export async function GET(req: Request, ctx: IdCtx) {
  const story = getStory((await ctx.params).id);
  if (!story) return fail(404, "not_found", "Story not found.");
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
  const sources = getMemoriesByIds(story.sourceIds);
  const slug = story.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "story";

  let body: string;
  if (format === "json") {
    body = JSON.stringify({ story, sources: sources.map(({ imageUrl, thumbUrl, ...m }) => m) }, null, 2);
  } else {
    const byId = new Map(sources.map((m) => [m.id, m]));
    const label = (id: string) => {
      const m = byId.get(id);
      return m ? `${m.title ?? (m.kind === "photo" ? "Photo" : "Note")}${m.date ? ` (${m.date})` : ""}` : "deleted source";
    };
    body = [
      `# ${story.title}`,
      "",
      story.intro,
      "",
      ...story.sections.flatMap((s) => [`## ${s.heading}`, "", s.text, "", `_Sources: ${s.sourceIds.map(label).join("; ")}_`, ""]),
      "---",
      `Generated with ${story.model} (Gemma 4) from the owner's selected memories, then reviewed. Theme: "${story.theme}".`,
      "",
    ].join("\n");
  }
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.${format}"`,
    },
  });
}
