import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMemory, getMemory, patchMemory } from "@/lib/db";
import { removePhotoFiles } from "@/lib/files";
import { fail, handleError, type IdCtx } from "@/lib/http";
import { LIMITS } from "@/lib/types";

const nullableStr = (max: number) => z.string().trim().max(max).nullable().transform((s) => (s ? s : null));

const Patch = z
  .object({
    title: nullableStr(200),
    note: nullableStr(LIMITS.maxNoteChars),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    people: z.array(z.string().trim().min(1).max(80)).max(20),
    location: nullableStr(200),
    included: z.boolean(),
    userDescription: nullableStr(1000),
    answer: nullableStr(1000),
    questionSkipped: z.boolean(),
  })
  .partial()
  .strict();

export async function GET(_req: Request, ctx: IdCtx) {
  const memory = getMemory((await ctx.params).id);
  return memory ? NextResponse.json({ memory }) : fail(404, "not_found", "Memory not found.");
}

export async function PATCH(req: Request, ctx: IdCtx) {
  try {
    const { id } = await ctx.params;
    if (!getMemory(id)) return fail(404, "not_found", "Memory not found.");
    const patch = Patch.parse(await req.json());
    return NextResponse.json({ memory: patchMemory(id, patch) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: IdCtx) {
  try {
    const { id } = await ctx.params;
    const m = getMemory(id);
    if (!m) return fail(404, "not_found", "Memory not found.");
    deleteMemory(id);
    if (m.kind === "photo") await removePhotoFiles(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
