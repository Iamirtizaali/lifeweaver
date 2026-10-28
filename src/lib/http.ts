import { NextResponse } from "next/server";
import { z } from "zod";
import { GemmaError } from "./gemma";

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Map thrown errors to the API error shape. Never echoes request content. */
export function handleError(e: unknown) {
  if (e instanceof GemmaError) {
    return e.code === "no_api_key"
      ? fail(503, "no_api_key", "Gemma is not configured. Add GEMINI_API_KEY to .env.local and restart the dev server.")
      : fail(502, "model_error", e.message);
  }
  if (e instanceof z.ZodError) {
    return fail(400, "invalid_input", e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  console.error("[lifeweaver] unexpected error:", (e as Error)?.message);
  return fail(500, "server_error", "Something went wrong on the server.");
}

export type IdCtx = { params: Promise<{ id: string }> };
