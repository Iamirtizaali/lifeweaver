import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteStory, getMemoriesByIds, getStory, patchStory } from "@/lib/db";
import { fail, handleError, type IdCtx } from "@/lib/http";

const Patch = z
  .object({
    title: z.string().trim().min(1).max(160),
    intro: z.string().trim().max(1500),
    sections: z
      .array(
        z.object({
          heading: z.string().trim().min(1).max(160),
          text: z.string().trim().min(1).max(6000),
          sourceIds: z.array(z.string()),
          imageIds: z.array(z.string()),
        })
      )
      .min(1)
      .max(12),
  })
  .partial()
  .strict();

export async function GET(_req: Request, ctx: IdCtx) {
  const story = getStory((await ctx.params).id);
  if (!story) return fail(404, "not_found", "Story not found.");
  return NextResponse.json({ story, sources: getMemoriesByIds(story.sourceIds) });
}

export async function PATCH(req: Request, ctx: IdCtx) {
  try {
    const { id } = await ctx.params;
    const cur = getStory(id);
    if (!cur) return fail(404, "not_found", "Story not found.");
    const p = Patch.parse(await req.json());
    if (p.sections) {
      // Edits may not introduce sources the story was not generated from.
      const allowed = new Set(cur.sourceIds);
      p.sections = p.sections.map((s) => ({
        ...s,
        sourceIds: s.sourceIds.filter((x) => allowed.has(x)),
        imageIds: s.imageIds.filter((x) => allowed.has(x)),
      }));
    }
    return NextResponse.json({ story: patchStory(id, p) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: IdCtx) {
  const { id } = await ctx.params;
  if (!getStory(id)) return fail(404, "not_found", "Story not found.");
  deleteStory(id);
  return NextResponse.json({ ok: true });
}
