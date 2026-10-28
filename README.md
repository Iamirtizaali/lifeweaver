# LifeWeaver

Turn your own photos and notes into a memory library and short, **source-linked illustrated stories** — written by **Gemma 4**, Google's open-weight model.

**Category:** Best Use of Gemma.

## Problem
Photos pile up without context. Generic AI "memories" invent feelings and facts. People want their story told from what actually happened — and to see where each sentence came from.

## What it does
One page: **Your moments. One beautiful story.**
1. **Add memories**: drag in photos (JPEG/PNG/WebP, up to 10 at 10 MB) and WhatsApp "Export chat" `.txt` files (without media), or paste a conversation / write a memory.
2. **Choose your story**: a trip, a friendship, family moments, or something else, with an optional title, instruction, date and names.
3. **Consent, then generate**: nothing is sent until you tick the consent box. Gemma 4 describes each photo, then writes a story from the photos and chat text.
4. **Relive it**: switch between **Story** and **Timeline**, open any source behind a section, edit the text, start a new story, or **Print / Save as PDF**.

## How Gemma 4 is used
| Task | Input | Output (validated server-side with Zod) |
|---|---|---|
| Photo review | 1024px JPEG copy of one photo (inline) | `{ description, tags[], question }` |
| Story | Selected memories as JSON: photo descriptions, chat lines (most recent ~8k chars per chat), notes, user-given dates/names | `{ title, intro, sections[{ heading, text, sourceIds[], imageIds[] }], timeline[] }` |

- Model: **`gemma-4-26b-a4b-it`** via the Gemini API (set with `GEMMA_MODEL`; must be a `gemma-*` model). `gemma-4-31b-it` also works but was slow and returned intermittent 500s for images in our tests. No fallback to any other model: failures are shown with a retry.
- Thinking level "minimal" keeps latency low (≈5 s per photo, ≈15 s per story in testing).
- JSON is extracted from the reply, validated, and retried once with the validation error if malformed.
- Grounding: chat text and notes are passed as **data, never instructions** (a planted "ignore all previous instructions" line in a test chat was ignored). Every source id the model returns is checked against the user's selection; dates come only from sources or the user, otherwise the item is marked **Undated**.
- All model calls live in `src/lib/gemma.ts`; chat parsing in `src/lib/chat.ts` and `src/components/lifeweaver/chat.ts`.

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
- Single-user demo. No accounts or auth: anyone with the URL can use the app and the configured Gemini quota.
- Data lives in `./data/` (gitignored): SQLite DB, originals, analysis copies. Files are served only through `/api/files/:id`, never from `public/`.
- Selected photos are sent to Google's Gemini API to run Gemma 4; the app asks before each analysis. Excluded memories are never sent.
- On Vercel, data persists in a **private Vercel Blob store**: the SQLite file is pulled before each API request and pushed after writes, and photos are written through to Blob (`src/lib/cloud.ts`). This suits a single-user demo; simultaneous writers can overwrite each other's changes, so a multi-user deployment needs a real database. Locally, `./data/` is used and Blob is never touched.

## Limitations
- Manual imports only: photos and plain-text WhatsApp exports. No PDF, ZIP, audio, Google Photos or face recognition.
- Generation needs an internet connection (the model runs on Google's Gemini API); there is no offline AI.
- Daily journal generation (DayThread) from the design doc is not in this build.
- Source links show provenance, not proof of accuracy — always review generated text.
- No EXIF date extraction: unknown dates stay unknown unless you enter them.

## Demo (2 min)
1. **Problem** (15 s): photos and chats pile up; generic AI "memories" invent things.
2. **Create** (45 s): click *Create your story*, drop 2–3 photos and a WhatsApp `.txt`, pick *A trip*, tick consent, *Generate my story*.
3. **Result** (40 s): read the story; switch to *Timeline* (real dates from the chat, undated items marked); open a source behind a section.
4. **Trust** (10 s): edit a line; *Print / PDF*.
5. **Gemma + open source** (10 s): Gemma 4 does all the vision and writing; MIT-licensed code; key stays server-side.

Use your own or clearly fictional photos and chats for the demo.

## License
Code: MIT (see `LICENSE`). Gemma 4 is provided under Google's [Gemma Terms of Use](https://ai.google.dev/gemma/terms); this repo does not include model weights.
