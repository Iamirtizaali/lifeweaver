import { NextResponse } from "next/server";
import { gemmaConfig } from "@/lib/gemma";
import type { Health } from "@/lib/types";

export async function GET() {
  const { key, model } = gemmaConfig();
  const body: Health = { gemmaConfigured: !!key, model: key ? model : null };
  return NextResponse.json(body);
}
