// Client-side handling of plain-text chat exports (WhatsApp .txt).
// The chat is split into dated chunks that become text memories through the existing
// POST /api/memories `note` field, so the story's sources keep real message dates.

export type DateOrder = "dmy" | "mdy";

export interface ParsedChat {
  /** Messages grouped by calendar day (YYYY-MM-DD), oldest first. Empty if no timestamps were recognised. */
  days: { date: string; lines: string[] }[];
  /** Lines before the first recognised timestamp, or the whole file when it isn't a WhatsApp export. */
  undated: string[];
  messageCount: number;
  /** True when every date could be read as either DD/MM or MM/DD. */
  ambiguous: boolean;
  order: DateOrder | "ymd";
}

export interface ChatChunk {
  title: string;
  date: string | null;
  text: string;
  truncated: boolean;
}

// "12/08/2019, 21:14 - Name: text"  or  "[12/08/19, 21:14:05] Name: text"
const LINE = /^‎?\[?(\d{1,4})[./-](\d{1,2})[./-](\d{2,4}),?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?(.*)$/;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseChat(raw: string, preferred: DateOrder = "dmy"): ParsedChat {
  const rows: { a: number; b: number; y: string; text: string }[] = [];
  const undated: string[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const m = LINE.exec(line);
    if (m) rows.push({ a: Number(m[1]), b: Number(m[2]), y: m[3], text: m[4].trim() });
    else if (rows.length) rows[rows.length - 1].text += `\n${line}`;
    else if (line.trim()) undated.push(line);
  }

  let order: ParsedChat["order"] = preferred;
  let ambiguous = false;
  if (rows.some((r) => r.a > 31)) order = "ymd";
  else if (rows.some((r) => r.a > 12)) order = "dmy";
  else if (rows.some((r) => r.b > 12)) order = "mdy";
  else ambiguous = rows.length > 0;

  const byDay = new Map<string, string[]>();
  for (const r of rows) {
    let y: number, mo: number, d: number;
    if (order === "ymd") [y, mo, d] = [r.a, r.b, Number(r.y)];
    else {
      y = Number(r.y.length === 2 ? `20${r.y}` : r.y);
      [d, mo] = order === "dmy" ? [r.a, r.b] : [r.b, r.a];
    }
    const valid = mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1970 && y < 2100;
    if (!valid) {
      undated.push(r.text);
      continue;
    }
    const key = `${y}-${pad(mo)}-${pad(d)}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r.text);
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lines]) => ({ date, lines }));
  return { days, undated, messageCount: rows.length, ambiguous, order };
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.lastIndexOf("\n", max - 2);
  return { text: `${text.slice(0, cut > max * 0.6 ? cut : max - 1)}…`, truncated: true };
}

/**
 * Split a parsed chat into at most `budget` chunks of consecutive days, each at most
 * `maxChars` long. Days are balanced by message count so no single chunk swallows the chat.
 */
export function chunkChat(chat: ParsedChat, fileName: string, budget: number, maxChars: number): ChatChunk[] {
  const label = fileName.replace(/\.txt$/i, "");
  if (chat.days.length === 0) {
    const { text, truncated } = clip(chat.undated.join("\n").trim(), maxChars);
    return text ? [{ title: `Chat: ${label}`, date: null, text, truncated }] : [];
  }
  const groups = Math.max(1, Math.min(budget, chat.days.length));
  const total = chat.days.reduce((n, d) => n + d.lines.length, 0);
  const target = total / groups;
  const chunks: { days: typeof chat.days }[] = [{ days: [] }];
  let count = 0;
  chat.days.forEach((day, i) => {
    const current = chunks[chunks.length - 1];
    const remainingDays = chat.days.length - i;
    const remainingGroups = groups - chunks.length;
    if (current.days.length && remainingGroups > 0 && (count >= target || remainingDays <= remainingGroups)) {
      chunks.push({ days: [] });
      count = 0;
    }
    chunks[chunks.length - 1].days.push(day);
    count += day.lines.length;
  });

  return chunks.map(({ days }) => {
    const first = days[0].date;
    const last = days[days.length - 1].date;
    const body = days.map((d) => `[${d.date}]\n${d.lines.join("\n")}`).join("\n\n");
    const { text, truncated } = clip(body, maxChars);
    return { title: `Chat: ${label} (${first === last ? first : `${first} to ${last}`})`, date: first, text, truncated };
  });
}
