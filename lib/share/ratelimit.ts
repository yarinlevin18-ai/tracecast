import { createHash } from "node:crypto";

export const SHARE_LIMIT = 10;
export const SHARE_WINDOW_MS = 60 * 60 * 1000;
const TABLE = "share_events";

/** The slice of the Supabase client the limiter uses, so tests can fake it. */
export type LimitClient = {
  from: (table: string) => {
    select: (cols: string, opts: { count: "exact"; head: true }) => {
      eq: (col: string, value: string) => {
        gte: (col: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

/** Salted sha256 so the table never stores a raw address. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Counts this network's shares in the last hour and records the new one.
 * Fails open: if Supabase cannot answer, sharing still works and the failure
 * is logged, because a broken limiter should not take the product down.
 */
export async function checkAndRecordShare(client: LimitClient, ipHash: string, now: Date = new Date()): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date(now.getTime() - SHARE_WINDOW_MS).toISOString();
  const { count, error } = await client.from(TABLE).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if (error) {
    console.error("share limit lookup failed", error.message);
    return { allowed: true, remaining: SHARE_LIMIT };
  }
  const used = count ?? 0;
  if (used >= SHARE_LIMIT) return { allowed: false, remaining: 0 };
  const ins = await client.from(TABLE).insert({ ip_hash: ipHash });
  if (ins.error) console.error("share limit record failed", ins.error.message);
  return { allowed: true, remaining: SHARE_LIMIT - used - 1 };
}
