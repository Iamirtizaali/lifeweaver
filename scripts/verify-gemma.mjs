// Verifies real Gemma access: one text call, then one image call.
// Usage: node --env-file=.env.local scripts/verify-gemma.mjs
// Prints only model id, status and timings — never the key.
import sharp from "sharp";

const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMMA_MODEL?.trim() || "gemma-4-31b-it";
if (!key || key === "your-key-here") {
  console.error("GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function call(label, parts) {
  const t = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 200 } }),
  });
  const data = await res.json().catch(() => ({}));
  const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  console.log(`${label}: HTTP ${res.status} in ${Date.now() - t} ms (model ${model})`);
  if (!res.ok) console.log(`  error: ${data.error?.message ?? res.statusText}`);
  else console.log(`  reply: ${text.slice(0, 200)}`);
  return res.ok;
}

// A generated test image: sage square with a gold circle (no personal data).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#6B9080"/><circle cx="128" cy="128" r="70" fill="#D6A95D"/></svg>`;
const jpeg = (await sharp(Buffer.from(svg)).jpeg().toBuffer()).toString("base64");

const okText = await call("text", [{ text: "Reply with one word: ready" }]);
const okImage = await call("image", [
  { inline_data: { mime_type: "image/jpeg", data: jpeg } },
  { text: "In one sentence, what shapes and colors are in this image?" },
]);
process.exit(okText && okImage ? 0 : 1);
