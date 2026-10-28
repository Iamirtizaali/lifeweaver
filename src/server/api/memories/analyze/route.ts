import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemoriesByIds, getMemoryRow, setAnalysis } from "@/lib/db";
import { readUpload } from "@/lib/files";
import { analyzePhoto, gemmaConfig, GemmaError } from "@/lib/gemma";
import { fail, handleError } from "@/lib/http";
import { LIMITS } from "@/lib/types";


const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(LIMITS.maxPhotosPerBatch * 3),
  consent: z.literal(true),
});

export async function POST(req: Request) {
  try {
    const { ids } = Body.parse(await req.json().catch(() => ({})));
    if (!gemmaConfig().key) throw new GemmaError("no_api_key", "missing key");

    // Inclusion rules enforced here, before anything is sent to the provider.
    const targets = getMemoriesByIds(ids).filter((m) => m.kind === "photo" && m.included && m.status !== "processing");
    for (const m of targets) setAnalysis(m.id, { status: "processing", error: null });

    const queue = [...targets];
    const worker = async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        try {
          const row = getMemoryRow(m.id);
          if (!row?.analysis_file) throw new Error("analysis copy missing");
          const b64 = (await readUpload(row.analysis_file as string)).toString("base64");
          const a = await analyzePhoto(b64, null);
          setAnalysis(m.id, { status: "ready", description: a.description, tags: a.tags, question: a.question ?? null, error: null });
        } catch (e) {
          const msg = e instanceof GemmaError ? e.message : "Analysis failed.";
          setAnalysis(m.id, { status: "failed", error: msg.slice(0, 300) });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    return NextResponse.json({ memories: getMemoriesByIds(ids) });
  } catch (e) {
    if (e instanceof z.ZodError && e.issues.some((i) => i.path[0] === "consent"))
      return fail(400, "invalid_input", "Confirm that selected photos may be sent to the AI provider.");
    return handleError(e);
  }
}
