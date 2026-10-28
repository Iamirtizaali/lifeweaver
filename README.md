# LifeWeaver

Turn your own photos and notes into a memory library and short, **source-linked illustrated stories** — written by **Gemma 4**, Google's open-weight model.

**Category:** Best Use of Gemma.

## Problem
Photos pile up without context. Generic AI "memories" invent feelings and facts. People want their story told from what actually happened — and to see where each sentence came from.

## What it does
1. **Upload** up to 10 photos (JPEG/PNG/WebP, ≤10 MB each) plus an optional note, date, people and place.
2. **Gemma 4 reviews each photo**: a factual visual description, tags, and one context question only you can answer. It is told never to guess identities, relationships, emotions or exact locations.
3. **You correct and add context**: edit the description, answer or skip the question, exclude anything you don't want used.
4. **Story Studio**: pick memories and a theme ("Our weekend trip"). Gemma 4 returns a title, intro and sections. Every section cites the memories it is based on; the server rejects any id outside your selection.
5. **Edit, save, export** as Markdown, JSON, or a print view (browser "Save as PDF").

## How Gemma 4 is used
| Task | Input | Output (validated server-side with Zod) |
|---|---|---|
| Photo review | 1024px JPEG copy of one photo | `{ description, tags[], question }` |
| Story writing | Selected, included memories as JSON (visual description + owner context) | `{ title, intro, sections[{ heading, text, sourceIds[], imageIds[] }] }` |

- Model: `gemma-4-31b-it` (configurable via `GEMMA_MODEL`, must be a `gemma-*` model) through the Gemini API. No silent fallback to another model — failures are shown and retryable.
- JSON is requested in the prompt, extracted, validated, and retried once with the validation error if malformed.
- Grounding: sources are passed as data, never instructions; references are checked against the allowed set in code.
- All model calls live in `src/lib/gemma.ts`.

## Architecture
```
Browser (React, src/components/lifeweaver)
   │  fetch JSON / multipart
Next.js 16 route handlers (src/app/api/**)
   ├─ src/lib/db.ts     SQLite (node:sqlite) → data/lifeweaver.db
   ├─ src/lib/files.ts  sharp: validate real type, keep original, make 1024px analysis copy → data/uploads/
   └─ src/lib/gemma.ts  Gemma 4 via Gemini API REST (server only; key never reaches the browser)
```
When a source memory is edited, stories using it are marked **outdated**; when it is deleted, they are marked **needs review**.

## Setup
Requires Node 22.5+ (uses built-in `node:sqlite`).
```bash
npm install
cp .env.example .env.local   # then put your key in .env.local
npm run dev                  # http://localhost:3000
```
`.env.local`:
```
GEMINI_API_KEY=...   # from https://aistudio.google.com/apikey
GEMMA_MODEL=gemma-4-31b-it
```
Check model access (one text + one image call, prints no secrets):
```bash
node --env-file=.env.local scripts/verify-gemma.mjs
```

## Storage & privacy
- Single-user **local demo**. No accounts or auth — do not host it publicly as is.
- Data lives in `./data/` (gitignored): SQLite DB, originals, analysis copies. Files are served only through `/api/files/:id`, never from `public/`.
- Selected photos are sent to Google's Gemini API to run Gemma 4; the app asks before each analysis. Excluded memories are never sent.
- Local SQLite and disk uploads will **not** persist on serverless hosting; storage must be revisited before deploying.

## Limitations
- Manual imports only (no Google Photos, Gmail, WhatsApp, audio, face recognition).
- Daily journal generation (DayThread) is planned; not in this build.
- Source links show provenance, not proof of accuracy — always review generated text.
- No EXIF date extraction: unknown dates stay unknown unless you enter them.

## Demo (2 min)
1. Upload 3–4 photos with a short note and date.
2. Confirm the privacy prompt → watch Gemma 4 describe each photo.
3. Fix one description, answer one context question.
4. Story Studio → select them → theme "Our weekend trip" → generate.
5. Click **View sources** on a section → the exact memories open.
6. Edit a line, save, refresh (it persists) → export Markdown / print to PDF.

## License
Code: MIT (see `LICENSE`). Gemma 4 is provided under Google's [Gemma Terms of Use](https://ai.google.dev/gemma/terms); this repo does not include model weights.
