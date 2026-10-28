import type { Memory } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function formatDate(value?: string | null): string {
  if (!value) return "";
  // YYYY-MM-DD is a calendar date; parse it as local noon so it never shifts a day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

/** Prefer the memory's own date; fall back to when it was added. */
export function memoryDate(m: Memory): string {
  return m.date ? formatDate(m.date) : `Added ${formatDate(m.createdAt)}`;
}

/** The user's correction always wins over the AI description. */
export function shownDescription(m: Memory): string {
  return (m.userDescription ?? m.description ?? "").trim();
}

export function memoryLabel(m: Memory): string {
  return (m.title || shownDescription(m) || m.note || (m.kind === "text" ? "Note" : "Photo")).trim();
}

export function memoryAlt(m: Memory): string {
  const text = (shownDescription(m) || m.title || m.note || "").trim();
  if (!text) return "Uploaded photo";
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;
}

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

/** Split model or user text into paragraphs on blank lines. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
