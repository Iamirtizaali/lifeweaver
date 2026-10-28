import { NextResponse } from "next/server";
import { insertMemory, listMemories, newId } from "@/lib/db";
import { parseChat } from "@/lib/chat";
import { removePhotoFiles, storePhoto } from "@/lib/files";
import { fail, handleError } from "@/lib/http";
import { LIMITS, type Memory } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json({ memories: listMemories() });
  } catch (e) {
    return handleError(e);
  }
}

const str = (v: FormDataEntryValue | null, max = 200) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "invalid_input", "Expected multipart form data.");

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const note = str(form.get("note"), LIMITS.maxNoteChars);
    const title = str(form.get("title"));
    const date = str(form.get("date"), 10);
    const location = str(form.get("location"));
    const people = (str(form.get("people"), 500) ?? "").split(",").map((p) => p.trim()).filter(Boolean).slice(0, 20);

    const chatFiles = form.getAll("chats").filter((f): f is File => f instanceof File && f.size > 0);
    const pastedChat = str(form.get("chat"), LIMITS.maxChatBytes);
    if (chatFiles.length > LIMITS.maxChatFiles) return fail(400, "invalid_input", `Up to ${LIMITS.maxChatFiles} chat files per upload.`);
    const chats: { name: string; raw: string }[] = [];
    for (const f of chatFiles) {
      if (f.size > LIMITS.maxChatBytes) return fail(413, "too_large", `"${f.name}" is over 1 MB.`);
      if (!/\.txt$/i.test(f.name)) return fail(415, "unsupported_type", `"${f.name}" is not a .txt chat export.`);
      const raw = await f.text();
      if (raw.includes("\u0000")) return fail(415, "unsupported_type", `"${f.name}" is not a plain-text file.`);
      chats.push({ name: f.name.replace(/\.txt$/i, ""), raw });
    }
    if (pastedChat) chats.push({ name: "Pasted conversation", raw: pastedChat });

    if (!files.length && !note && !chats.length) return fail(400, "invalid_input", "Add at least one photo, chat or written memory.");
    if (files.length > LIMITS.maxPhotosPerBatch)
      return fail(400, "invalid_input", `Up to ${LIMITS.maxPhotosPerBatch} photos per upload.`);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "invalid_input", "Date must be YYYY-MM-DD.");
    for (const f of files) {
      if (f.size > LIMITS.maxPhotoBytes) return fail(413, "too_large", `"${f.name}" is over 10 MB.`);
    }

    // Validate every file before storing any, so a bad file doesn't leave a half batch.
    const bufs = await Promise.all(files.map(async (f) => ({ name: f.name, buf: Buffer.from(await f.arrayBuffer()) })));
    const created: Memory[] = [];
    const stored: { id: string; original: string; analysis: string; mime: string }[] = [];
    for (const { name, buf } of bufs) {
      const id = newId();
      const r = await storePhoto(id, buf);
      if (!r.ok) {
        await Promise.all([id, ...stored.map((s) => s.id)].map(removePhotoFiles));
        return fail(415, "unsupported_type", `"${name}" is not a valid JPEG, PNG or WebP image.`);
      }
      stored.push({ id, ...r });
    }
    for (const s of stored) {
      created.push(
        insertMemory({ id: s.id, kind: "photo", title, note: null, date, people, location, originalFile: s.original, analysisFile: s.analysis, mime: s.mime })
      );
    }
    if (note) created.push(insertMemory({ kind: "text", title, note, date, people, location }));
    for (const c of chats) {
      const parsed = parseChat(c.raw);
      if (!parsed.text) continue;
      created.push(
        insertMemory({
          kind: "chat",
          title: c.name,
          note: parsed.text.slice(0, LIMITS.maxChatBytes),
          date: parsed.firstDate ?? date,
          people: parsed.participants.length ? parsed.participants : people,
          location,
        })
      );
    }
    return NextResponse.json({ memories: created }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
