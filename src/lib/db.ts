import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Memory, MemoryPatch, Story } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const g = globalThis as unknown as { __lwdb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__lwdb) return g.__lwdb;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "lifeweaver.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT, note TEXT, date TEXT,
      people TEXT NOT NULL DEFAULT '[]',
      location TEXT,
      included INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      description TEXT, user_description TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      question TEXT, answer TEXT,
      question_skipped INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      original_file TEXT, analysis_file TEXT, mime TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL, intro TEXT NOT NULL, theme TEXT NOT NULL,
      tone TEXT NOT NULL, length TEXT NOT NULL,
      sections TEXT NOT NULL, source_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'current',
      model TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  g.__lwdb = d;
  return d;
}

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
export const newId = () => randomUUID();

export interface MemoryRow {
  id: string;
  kind: string;
  original_file: string | null;
  analysis_file: string | null;
  mime: string | null;
}

export function toMemory(r: Row): Memory {
  const id = r.id as string;
  const hasFile = !!r.original_file;
  return {
    id,
    kind: r.kind as Memory["kind"],
    title: (r.title as string) ?? null,
    note: (r.note as string) ?? null,
    date: (r.date as string) ?? null,
    people: JSON.parse((r.people as string) || "[]"),
    location: (r.location as string) ?? null,
    included: !!r.included,
    status: r.status as Memory["status"],
    description: (r.description as string) ?? null,
    userDescription: (r.user_description as string) ?? null,
    tags: JSON.parse((r.tags as string) || "[]"),
    question: (r.question as string) ?? null,
    answer: (r.answer as string) ?? null,
    questionSkipped: !!r.question_skipped,
    error: (r.error as string) ?? null,
    imageUrl: hasFile ? `/api/files/${id}?v=original` : null,
    thumbUrl: hasFile ? `/api/files/${id}?v=analysis` : null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertMemory(m: {
  kind: "photo" | "text";
  title: string | null;
  note: string | null;
  date: string | null;
  people: string[];
  location: string | null;
  originalFile?: string | null;
  analysisFile?: string | null;
  mime?: string | null;
  id?: string;
}): Memory {
  const id = m.id ?? newId();
  const t = now();
  db()
    .prepare(
      `INSERT INTO memories (id, kind, title, note, date, people, location, included, status,
        original_file, analysis_file, mime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, m.kind, m.title, m.note, m.date, JSON.stringify(m.people), m.location,
      m.kind === "text" ? "ready" : "uploaded",
      m.originalFile ?? null, m.analysisFile ?? null, m.mime ?? null, t, t
    );
  return getMemory(id)!;
}

export function getMemoryRow(id: string): Row | undefined {
  return db().prepare("SELECT * FROM memories WHERE id = ?").get(id) as Row | undefined;
}

export function getMemory(id: string): Memory | null {
  const r = getMemoryRow(id);
  return r ? toMemory(r) : null;
}

export function listMemories(): Memory[] {
  return (db().prepare("SELECT * FROM memories ORDER BY COALESCE(date, substr(created_at,1,10)) DESC, created_at DESC").all() as Row[]).map(toMemory);
}

export function getMemoriesByIds(ids: string[]): Memory[] {
  return ids.map(getMemory).filter((m): m is Memory => !!m);
}

const PATCH_COLS: Record<keyof MemoryPatch, string> = {
  title: "title", note: "note", date: "date", people: "people", location: "location",
  included: "included", userDescription: "user_description", answer: "answer",
  questionSkipped: "question_skipped",
};

export function patchMemory(id: string, patch: MemoryPatch): Memory | null {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = PATCH_COLS[k as keyof MemoryPatch];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    if (k === "people") vals.push(JSON.stringify(v));
    else if (typeof v === "boolean") vals.push(v ? 1 : 0);
    else vals.push(v as string | null);
  }
  if (!sets.length) return getMemory(id);
  db().prepare(`UPDATE memories SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, now(), id);
  markStories(id, "outdated");
  return getMemory(id);
}

export function setAnalysis(
  id: string,
  a: { status: Memory["status"]; description?: string | null; tags?: string[]; question?: string | null; error?: string | null }
) {
  db()
    .prepare(
      `UPDATE memories SET status = ?, description = COALESCE(?, description), tags = COALESCE(?, tags),
        question = COALESCE(?, question), error = ?, updated_at = ? WHERE id = ?`
    )
    .run(a.status, a.description ?? null, a.tags ? JSON.stringify(a.tags) : null, a.question ?? null, a.error ?? null, now(), id);
}

export function deleteMemory(id: string) {
  db().prepare("DELETE FROM memories WHERE id = ?").run(id);
  markStories(id, "needs_review");
}

/** Flag stories that used this memory. needs_review outranks outdated. */
function markStories(memoryId: string, status: "outdated" | "needs_review") {
  const rows = db().prepare("SELECT id, source_ids, status FROM stories").all() as Row[];
  for (const r of rows) {
    const ids: string[] = JSON.parse(r.source_ids as string);
    if (!ids.includes(memoryId)) continue;
    if (r.status === "needs_review" && status === "outdated") continue;
    db().prepare("UPDATE stories SET status = ? WHERE id = ?").run(status, r.id as string);
  }
}

function toStory(r: Row): Story {
  return {
    id: r.id as string,
    title: r.title as string,
    intro: r.intro as string,
    theme: r.theme as string,
    tone: r.tone as Story["tone"],
    length: r.length as Story["length"],
    sections: JSON.parse(r.sections as string),
    sourceIds: JSON.parse(r.source_ids as string),
    status: r.status as Story["status"],
    model: r.model as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertStory(s: Omit<Story, "id" | "createdAt" | "updatedAt" | "status">): Story {
  const id = newId();
  const t = now();
  db()
    .prepare(
      `INSERT INTO stories (id, title, intro, theme, tone, length, sections, source_ids, status, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?)`
    )
    .run(id, s.title, s.intro, s.theme, s.tone, s.length, JSON.stringify(s.sections), JSON.stringify(s.sourceIds), s.model, t, t);
  return getStory(id)!;
}

export function getStory(id: string): Story | null {
  const r = db().prepare("SELECT * FROM stories WHERE id = ?").get(id) as Row | undefined;
  return r ? toStory(r) : null;
}

export function listStories(): Story[] {
  return (db().prepare("SELECT * FROM stories ORDER BY created_at DESC").all() as Row[]).map(toStory);
}

export function patchStory(id: string, p: { title?: string; intro?: string; sections?: Story["sections"] }): Story | null {
  const cur = getStory(id);
  if (!cur) return null;
  db()
    .prepare("UPDATE stories SET title = ?, intro = ?, sections = ?, updated_at = ? WHERE id = ?")
    .run(p.title ?? cur.title, p.intro ?? cur.intro, JSON.stringify(p.sections ?? cur.sections), now(), id);
  return getStory(id);
}

export function deleteStory(id: string) {
  db().prepare("DELETE FROM stories WHERE id = ?").run(id);
}
