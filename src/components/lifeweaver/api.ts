// Thin client for the routes documented in HANDOFF.md. Types come from the lead's @/lib/types.
import type { ApiError, Health, Memory, MemoryPatch, Story, StoryLength, StoryTone } from "@/lib/types";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError("Couldn't reach LifeWeaver. Check your connection and try again.", "network", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    const err = body?.error;
    throw new ApiRequestError(err?.message || `Request failed (${res.status}).`, err?.code || "http_error", res.status);
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request<Health>("/api/health"),

  listMemories: () => request<{ memories: Memory[] }>("/api/memories").then((r) => r.memories),

  uploadMemories: (input: {
    files: File[];
    note: string;
    title: string;
    date: string;
    people: string;
    location: string;
  }) => {
    const fd = new FormData();
    for (const f of input.files) fd.append("files", f);
    fd.append("note", input.note);
    fd.append("title", input.title);
    fd.append("date", input.date);
    fd.append("people", input.people);
    fd.append("location", input.location);
    return request<{ memories: Memory[] }>("/api/memories", { method: "POST", body: fd }).then((r) => r.memories);
  },

  updateMemory: (id: string, patch: MemoryPatch) =>
    request<{ memory: Memory }>(`/api/memories/${encodeURIComponent(id)}`, json("PATCH", patch)).then((r) => r.memory),

  deleteMemory: (id: string) =>
    request<{ ok: true }>(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" }),

  analyze: (ids: string[]) =>
    request<{ memories: Memory[] }>("/api/memories/analyze", json("POST", { ids, consent: true })).then(
      (r) => r.memories,
    ),

  createStory: (input: { memoryIds: string[]; theme: string; tone: StoryTone; length: StoryLength }) =>
    request<{ story: Story }>("/api/stories", json("POST", input)).then((r) => r.story),

  listStories: () => request<{ stories: Story[] }>("/api/stories").then((r) => r.stories),

  getStory: (id: string) => request<{ story: Story; sources: Memory[] }>(`/api/stories/${encodeURIComponent(id)}`),

  updateStory: (id: string, patch: Partial<Pick<Story, "title" | "intro" | "sections">>) =>
    request<{ story: Story }>(`/api/stories/${encodeURIComponent(id)}`, json("PATCH", patch)).then((r) => r.story),

  deleteStory: (id: string) => request<{ ok: true }>(`/api/stories/${encodeURIComponent(id)}`, { method: "DELETE" }),

  exportUrl: (id: string, format: "md" | "json") => `/api/stories/${encodeURIComponent(id)}/export?format=${format}`,
};

/** Friendlier copy for the error codes HANDOFF.md asks us to handle. */
export function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "no_api_key":
        return "AI isn't set up yet: add a Gemini API key on the server (see .env.example), then try again.";
      case "model_error":
        return `The model couldn't finish: ${err.message} You can retry.`;
      case "too_large":
        return `That upload is too large. ${err.message}`;
      case "unsupported_type":
        return `That file type isn't supported. Use JPEG, PNG, or WebP.`;
      case "not_found":
        return "That item no longer exists. It may have been deleted.";
      default:
        return err.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}
