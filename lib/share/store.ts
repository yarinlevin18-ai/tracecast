import type { Trace } from "@/lib/trace/types";
import { isValidId, makeId } from "./id";
import { validateTrace } from "./validate";

export const BUCKET = "traces";
export const TABLE = "traces";

/** The slice of the Supabase client the store uses, so tests can fake it. */
export type StoreClient = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: string, opts: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>;
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
    };
  };
};

export type UploadOptions = { expiresInDays: number | null; now?: Date; id?: string };

export async function uploadTrace(client: StoreClient, trace: Trace, opts: UploadOptions): Promise<{ id: string; expiresAt: string | null }> {
  const id = opts.id ?? makeId();
  if (!isValidId(id)) throw new Error("invalid share id");
  const now = opts.now ?? new Date();
  const expiresAt = opts.expiresInDays ? new Date(now.getTime() + opts.expiresInDays * 86_400_000).toISOString() : null;
  const path = `${id}.json`;

  const up = await client.storage.from(BUCKET).upload(path, JSON.stringify(trace), { contentType: "application/json", upsert: false });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  const ins = await client.from(TABLE).insert({ id, title: trace.title, totals: trace.totals, storage_path: path, expires_at: expiresAt });
  if (ins.error) {
    // Best effort: do not leave an orphan file behind when the row fails.
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new Error(`insert failed: ${ins.error.message}`);
  }

  return { id, expiresAt };
}

/** Null when the id is malformed, the row is missing or it has expired. */
export async function loadTrace(client: StoreClient, id: string, now: Date = new Date()): Promise<Trace | null> {
  if (!isValidId(id)) return null;
  const { data: row, error } = await client.from(TABLE).select("id, storage_path, expires_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`lookup failed: ${error.message}`);
  if (!row) return null;
  const expiresAt = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : null;
  if (expiresAt !== null && expiresAt <= now.getTime()) return null;

  const file = await client.storage.from(BUCKET).download(String(row.storage_path));
  if (file.error || !file.data) return null;
  return validateTrace(JSON.parse(await file.data.text()));
}
