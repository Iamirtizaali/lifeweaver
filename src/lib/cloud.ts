// Hosted persistence: on Vercel, /tmp is per-instance, so the SQLite file and uploads are
// mirrored to a private Vercel Blob store. Locally (no VERCEL env) this is all a no-op.
import { del, get, list, put } from "@vercel/blob";

const PREFIX = "lifeweaver/";
const DB_BLOB = `${PREFIX}db.sqlite`;

export const cloudEnabled = () => !!process.env.VERCEL && !!process.env.BLOB_READ_WRITE_TOKEN;

async function read(pathname: string): Promise<Buffer | null> {
  // useCache: false reads the latest version from origin, not a stale CDN copy.
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

async function write(pathname: string, body: Buffer, contentType: string) {
  await put(pathname, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}

export const pullDb = () => read(DB_BLOB);
export const pushDb = (buf: Buffer) => write(DB_BLOB, buf, "application/vnd.sqlite3");

export const putUpload = (rel: string, buf: Buffer, contentType: string) => write(`${PREFIX}uploads/${rel}`, buf, contentType);
export const fetchUpload = (rel: string) => read(`${PREFIX}uploads/${rel}`);

export async function deleteUploads(id: string) {
  const { blobs } = await list({ prefix: `${PREFIX}uploads/${id}/` });
  if (blobs.length) await del(blobs.map((b) => b.url));
}
