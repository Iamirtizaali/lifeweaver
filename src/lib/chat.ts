// Bounded parsing of WhatsApp-style plain-text chat exports. Text is data only.

export interface ParsedChat {
  text: string; // normalized "date — Name: message" lines
  messageCount: number;
  firstDate: string | null; // YYYY-MM-DD
  lastDate: string | null;
  participants: string[];
}

// Matches "[12/10/2026, 18:04:11] Sara: hi" and "12/10/26, 6:04 pm - Sara: hi"
const LINE = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[ap]\.?m\.?)?\]?\s*(?:-|–)?\s*([^:]{1,60}):\s?(.*)$/i;

function toIso(a: number, b: number, y: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  // Day-first is the WhatsApp default outside the US; fall back to month-first if impossible.
  let [d, m] = [a, b];
  if (m > 12 && d <= 12) [d, m] = [b, a];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SKIP = /(<media omitted>|messages and calls are end-to-end encrypted|this message was deleted|image omitted|sticker omitted)/i;

export function parseChat(raw: string): ParsedChat {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/[‎‏‪-‮]/g, "").split("\n");
  const out: string[] = [];
  const people = new Set<string>();
  const dates: string[] = [];
  let count = 0;
  for (const line of lines) {
    const m = line.match(LINE);
    if (m) {
      const iso = toIso(+m[1], +m[2], +m[3]);
      const name = m[5].trim();
      const msg = m[6].trim();
      if (!msg || SKIP.test(msg)) continue;
      if (iso) dates.push(iso);
      people.add(name);
      out.push(`${iso ?? "undated"} — ${name}: ${msg}`);
      count++;
    } else if (line.trim() && out.length) {
      out[out.length - 1] += " " + line.trim(); // continuation of a multi-line message
    }
  }
  if (!count) {
    // Not a recognized export: keep as plain pasted text.
    const text = raw.trim();
    return { text, messageCount: 0, firstDate: null, lastDate: null, participants: [] };
  }
  const sorted = [...dates].sort();
  return {
    text: out.join("\n"),
    messageCount: count,
    firstDate: sorted[0] ?? null,
    lastDate: sorted[sorted.length - 1] ?? null,
    participants: [...people].slice(0, 20),
  };
}

/** Keep the most recent part of a long chat within a character budget. */
export function boundChat(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const tail = text.slice(text.length - maxChars);
  const nl = tail.indexOf("\n");
  return "[earlier messages omitted]\n" + (nl >= 0 ? tail.slice(nl + 1) : tail);
}
