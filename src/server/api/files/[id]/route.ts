import { getMemoryRow } from "@/lib/db";
import { MIME, readUpload } from "@/lib/files";
import { fail, type IdCtx } from "@/lib/http";

export async function GET(req: Request, ctx: IdCtx) {
  const { id } = await ctx.params;
  const row = getMemoryRow(id);
  const variant = new URL(req.url).searchParams.get("v") === "original" ? "original_file" : "analysis_file";
  const rel = row?.[variant] as string | undefined;
  if (!rel) return fail(404, "not_found", "File not found.");
  try {
    const buf = await readUpload(rel);
    const ext = rel.split(".").pop() ?? "jpg";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return fail(404, "not_found", "File not found.");
  }
}
