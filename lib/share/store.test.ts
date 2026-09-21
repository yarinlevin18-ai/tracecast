import { describe, expect, it, vi } from "vitest";
import { loadTrace, uploadTrace, type StoreClient } from "./store";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "sess",
  source: "claude-code",
  title: "Hello",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:01:00.000Z",
  totals: { inputTokens: 1, outputTokens: 2, toolCalls: 3, durationMs: 60000 },
  steps: [],
};

function fake(row: Record<string, unknown> | null = null, file: string | null = null) {
  const upload = vi.fn(async () => ({ error: null }));
  const download = vi.fn(async () => (file === null ? { data: null, error: { message: "missing" } } : { data: new Blob([file]), error: null }));
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    void row;
    return { error: null };
  });
  const remove = vi.fn(async (paths: string[]) => {
    void paths;
    return { error: null };
  });
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const client: StoreClient = {
    storage: { from: () => ({ upload, download, remove }) },
    from: () => ({ insert, select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
  return { client, upload, download, insert, remove, maybeSingle };
}

describe("uploadTrace", () => {
  it("uploads the json and inserts a row with expiry", async () => {
    const f = fake();
    const now = new Date("2026-09-21T12:00:00.000Z");
    const out = await uploadTrace(f.client, trace, { expiresInDays: 7, now, id: "AbCdEfGhIjKl" });
    expect(out.id).toBe("AbCdEfGhIjKl");
    expect(f.upload).toHaveBeenCalledWith("AbCdEfGhIjKl.json", JSON.stringify(trace), { contentType: "application/json", upsert: false });
    expect(f.insert).toHaveBeenCalledWith({
      id: "AbCdEfGhIjKl",
      title: "Hello",
      totals: trace.totals,
      storage_path: "AbCdEfGhIjKl.json",
      expires_at: "2026-09-28T12:00:00.000Z",
    });
  });

  it("stores null expiry when not requested", async () => {
    const f = fake();
    await uploadTrace(f.client, trace, { expiresInDays: null, id: "AbCdEfGhIjKl" });
    expect(f.insert.mock.calls[0][0]).toMatchObject({ expires_at: null });
  });

  it("rejects a malformed id before touching storage", async () => {
    const f = fake();
    await expect(uploadTrace(f.client, trace, { expiresInDays: null, id: "../x" })).rejects.toThrow(/invalid/);
    expect(f.upload).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the row insert fails", async () => {
    const f = fake();
    f.insert.mockResolvedValueOnce({ error: { message: "dup" } } as never);
    await expect(uploadTrace(f.client, trace, { expiresInDays: null, id: "AbCdEfGhIjKl" })).rejects.toThrow(/dup/);
    expect(f.remove).toHaveBeenCalledWith(["AbCdEfGhIjKl.json"]);
  });

  it("throws when the upload fails", async () => {
    const f = fake();
    f.upload.mockResolvedValueOnce({ error: { message: "boom" } } as never);
    await expect(uploadTrace(f.client, trace, { expiresInDays: null })).rejects.toThrow(/boom/);
  });
});

describe("loadTrace", () => {
  it("returns null for a missing row or an expired one", async () => {
    expect(await loadTrace(fake().client, "AbCdEfGhIjKl")).toBeNull();
    const expired = fake({ id: "x", storage_path: "x.json", expires_at: "2020-01-01T00:00:00.000Z" }, JSON.stringify(trace));
    expect(await loadTrace(expired.client, "AbCdEfGhIjKl")).toBeNull();
  });

  it("returns the parsed trace when live", async () => {
    const f = fake({ id: "x", storage_path: "x.json", expires_at: null }, JSON.stringify(trace));
    const out = await loadTrace(f.client, "AbCdEfGhIjKl");
    expect(out?.title).toBe("Hello");
    expect(f.download).toHaveBeenCalledWith("x.json");
  });

  it("rejects malformed ids without touching the client", async () => {
    const f = fake();
    expect(await loadTrace(f.client, "../x")).toBeNull();
    expect(f.maybeSingle).not.toHaveBeenCalled();
  });
});
