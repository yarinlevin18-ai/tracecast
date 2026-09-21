import { describe, expect, it, vi } from "vitest";
import { checkAndRecordShare, hashIp, SHARE_LIMIT, type LimitClient } from "./ratelimit";

function fake(count: number | null, error: { message: string } | null = null) {
  const gte = vi.fn(async (_col: string, _value: string) => {
    void _col;
    void _value;
    return { count, error };
  });
  const eq = vi.fn((_col: string, _value: string) => {
    void _col;
    void _value;
    return { gte };
  });
  const select = vi.fn((_cols: string, _opts: { count: "exact"; head: true }) => {
    void _cols;
    void _opts;
    return { eq };
  });
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    void row;
    return { error: null };
  });
  const client: LimitClient = { from: () => ({ select, insert }) };
  return { client, select, eq, gte, insert };
}

describe("hashIp", () => {
  it("is stable, salted and does not contain the ip", () => {
    const a = hashIp("203.0.113.9", "salt");
    expect(a).toBe(hashIp("203.0.113.9", "salt"));
    expect(a).not.toBe(hashIp("203.0.113.9", "other"));
    expect(a).not.toContain("203.0.113.9");
    expect(a).toHaveLength(64);
  });
});

describe("checkAndRecordShare", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it("records the share and reports the remaining budget", async () => {
    const f = fake(3);
    const out = await checkAndRecordShare(f.client, "h", now);
    expect(out).toEqual({ allowed: true, remaining: SHARE_LIMIT - 4 });
    expect(f.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(f.eq).toHaveBeenCalledWith("ip_hash", "h");
    expect(f.gte).toHaveBeenCalledWith("created_at", "2026-09-21T11:00:00.000Z");
    expect(f.insert).toHaveBeenCalledWith({ ip_hash: "h" });
  });

  it("refuses without recording once the limit is reached", async () => {
    const f = fake(SHARE_LIMIT);
    expect(await checkAndRecordShare(f.client, "h", now)).toEqual({ allowed: false, remaining: 0 });
    expect(f.insert).not.toHaveBeenCalled();
  });

  it("fails open when the count query errors", async () => {
    const f = fake(null, { message: "down" });
    expect((await checkAndRecordShare(f.client, "h", now)).allowed).toBe(true);
  });
});
