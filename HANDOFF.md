# LifeWeaver — frontend handoff

## Stack
Next.js 16.4 (App Router, TypeScript, `src/`), React 19.3, plain CSS (CSS Modules for components), Zod, sharp, SQLite via Node's built-in `node:sqlite`. Gemma 4 via the Gemini API, called **only from server routes**. No Tailwind, no UI or animation library.

Run: `npm install` then `npm run dev` → http://localhost:3000. Check: `npm run build`, `npm run lint`.

## Ownership
| Owner | Paths |
|---|---|
| **Frontend session** | `src/components/lifeweaver/**` (anything inside: components, `*.module.css`, hooks, helpers) |
| **Lead (backend/Gemma)** | everything else: `src/app/**` (layout, `globals.css`, pages, `api/**`), `src/lib/**`, `package.json`, configs, docs |

Frontend must not edit `package.json` or add dependencies. If you need a new shared type or endpoint change, ask the lead.

## Mount points (lead mounts these; frontend implements them)
| File frontend creates | Export | Mounted by |
|---|---|---|
| `src/components/lifeweaver/LifeWeaverApp.tsx` | `export default function LifeWeaverApp()` — `"use client"`, whole app: nav (Library · Story Studio), library grid, upload, detail drawer, selection tray, story studio, story reader | `src/app/page.tsx` |
| `src/components/lifeweaver/StoryPrintView.tsx` | `export default function StoryPrintView({ storyId }: { storyId: string })` — `"use client"`, print layout, fetches `GET /api/stories/:id`, calls `window.print()` from a button | `src/app/stories/[id]/print/page.tsx` |

Types: `import type { Memory, Story, ... } from "@/lib/types"` and `LIMITS` for client-side checks (server enforces them too).

## Design tokens (in `src/app/globals.css`, use the variables)
`--paper #FAF7F2` · `--paper-2 #F3EEE6` · `--ink #2B2D42` · `--plum #7A5F6A` (text: `--plum-ink #5E4651`) · `--sage #6B9080` (text: `--sage-ink #4A6B5D`) · `--gold #D6A95D` (decor only) · `--border #E4DED4` · `--danger #A63D40` · `--ok #3D7A5A`. Fonts: `var(--font-serif)` Fraunces (headings), `var(--font-sans)` Nunito Sans (UI). Radii `--r-sm 8px --r-md 14px --r-lg 22px`; spacing `--s-1..--s-8` (4,8,12,16,24,32,48,64px). Respect `prefers-reduced-motion`.

## API contract (all JSON unless noted; errors are `{ error: { code, message } }` with 4xx/5xx)
| Method & path | Request | Response |
|---|---|---|
| `GET /api/health` | — | `{ gemmaConfigured: boolean, model: string \| null }` |
| `GET /api/memories` | — | `{ memories: Memory[] }` newest first |
| `POST /api/memories` | **multipart**: `files` (0–10 × JPEG/PNG/WebP ≤10 MB), `note`, `title`, `date` (YYYY-MM-DD), `people` (comma-separated), `location`. Needs ≥1 file or a note. | `201 { memories: Memory[] }` — one photo memory per file (shares title/date/people/location), plus one text memory if `note` given. Status `uploaded`. |
| `PATCH /api/memories/:id` | `MemoryPatch` | `{ memory: Memory }` |
| `DELETE /api/memories/:id` | — | `{ ok: true }` (removes files; dependent stories → `needs_review`) |
| `POST /api/memories/analyze` | `{ ids: string[], consent: true }` | `{ memories: Memory[] }` — each `ready` or `failed` (with `error`). Excluded/text memories are skipped and returned unchanged. Slow: ~5–20 s per photo, show progress. Re-calling on a `failed` id retries in place. |
| `GET /api/files/:id?v=analysis\|original` | — | image bytes (use `memory.thumbUrl` / `memory.imageUrl`) |
| `POST /api/stories` | `{ memoryIds: string[], theme: string, tone: "warm"\|"plain"\|"reflective", length: "short"\|"medium" }` | `201 { story: Story }` — only included, non-failed memories are used; 400 if none eligible |
| `GET /api/stories` | — | `{ stories: Story[] }` |
| `GET /api/stories/:id` | — | `{ story: Story, sources: Memory[] }` (sources = memories still existing) |
| `PATCH /api/stories/:id` | `{ title?, intro?, sections? }` | `{ story: Story }` |
| `DELETE /api/stories/:id` | — | `{ ok: true }` |
| `GET /api/stories/:id/export?format=md\|json` | — | file download |

Error codes to handle: `no_api_key` (503, show setup message), `model_error` (502, retry), `invalid_input` (400), `too_large` (413), `unsupported_type` (415), `not_found` (404).

## UX rules that matter
- Before analysis show: "Selected photos are sent to Google's Gemini API to run Gemma 4." Send `consent: true` only after the user confirms.
- Show `userDescription ?? description`; label Gemma text as AI-generated and editable. Never show demo/fixture text as a model result.
- Story sections: "View sources" opens those memories (`sourceIds`), images from `imageIds` via `thumbUrl`.
- Disable submit buttons while requests are in flight (no duplicates).
- Story `status` ≠ `current` → show a review banner.
