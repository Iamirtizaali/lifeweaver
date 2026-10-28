// Single entry point for every API route. On Vercel each Next.js route becomes its own
// function with its own /tmp; serving all of them from one function lets uploads, the
// SQLite file and later requests share the same warm instance during a demo.
import * as files from "@/server/api/files/[id]/route";
import * as health from "@/server/api/health/route";
import * as memory from "@/server/api/memories/[id]/route";
import * as analyze from "@/server/api/memories/analyze/route";
import * as memories from "@/server/api/memories/route";
import * as exportStory from "@/server/api/stories/[id]/export/route";
import * as story from "@/server/api/stories/[id]/route";
import * as stories from "@/server/api/stories/route";
import { fail } from "@/lib/http";

export const maxDuration = 300;

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> | Response;
type Module = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

function resolve(path: string[]): { mod: Module; id?: string } | null {
  const [a, b, c] = path;
  if (a === "health" && !b) return { mod: health };
  if (a === "files" && b && !c) return { mod: files, id: b };
  if (a === "memories") {
    if (!b) return { mod: memories };
    if (b === "analyze" && !c) return { mod: analyze };
    if (!c) return { mod: memory, id: b };
  }
  if (a === "stories") {
    if (!b) return { mod: stories };
    if (!c) return { mod: story, id: b };
    if (c === "export" && path.length === 3) return { mod: exportStory, id: b };
  }
  return null;
}

async function dispatch(method: keyof Module, req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const r = resolve((await ctx.params).path);
  const handler = r?.mod[method];
  if (!r || !handler) return fail(404, "not_found", "Unknown API route.");
  return handler(req, { params: Promise.resolve({ id: r.id ?? "" }) });
}

type Ctx = { params: Promise<{ path: string[] }> };
export const GET = (req: Request, ctx: Ctx) => dispatch("GET", req, ctx);
export const POST = (req: Request, ctx: Ctx) => dispatch("POST", req, ctx);
export const PATCH = (req: Request, ctx: Ctx) => dispatch("PATCH", req, ctx);
export const DELETE = (req: Request, ctx: Ctx) => dispatch("DELETE", req, ctx);
