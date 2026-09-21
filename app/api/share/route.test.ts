import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadTrace, getAdminClient } = vi.hoisted(() => ({ uploadTrace: vi.fn(), getAdminClient: vi.fn() }));
vi.mock("@/lib/share/store", async (orig) => ({ ...(await orig<typeof import("@/lib/share/store")>()), uploadTrace }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient,
  SharingNotConfigured: class SharingNotConfigured extends Error {},
}));

import { POST } from "./route";
import { SharingNotConfigured } from "@/lib/supabase/admin";

const trace = {
  id: "s",
  source: "claude-code",
  title: "Hello",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:00:00.000Z",
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: [{ id: "a", index: 0, at: "2026-09-21T10:00:00.000Z", kind: "user", agent: "main", text: "hi" }],
};

function post(body: unknown) {
  return POST(new Request("http://localhost/api/share", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
}

describe("POST /api/share", () => {
  beforeEach(() => {
    uploadTrace.mockReset();
    getAdminClient.mockReset();
    getAdminClient.mockReturnValue({});
  });

  it("uploads a valid trace and returns the share url", async () => {
    uploadTrace.mockResolvedValue({ id: "AbCdEfGhIjKl", expiresAt: null });
    const res = await post({ trace, expiresInDays: 30 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "AbCdEfGhIjKl", url: "http://localhost/r/AbCdEfGhIjKl", expiresAt: null });
    expect(uploadTrace).toHaveBeenCalledWith({}, expect.objectContaining({ title: "Hello" }), { expiresInDays: 30 });
  });

  it("rejects invalid traces with 400", async () => {
    const res = await post({ trace: { nope: true } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be/);
  });

  it("rejects bad expiry values", async () => {
    expect((await post({ trace, expiresInDays: 3 })).status).toBe(400);
  });

  it("answers 503 when sharing is not configured", async () => {
    getAdminClient.mockImplementation(() => {
      throw new SharingNotConfigured();
    });
    const res = await post({ trace, expiresInDays: null });
    expect(res.status).toBe(503);
  });

  it("answers 400 on malformed json", async () => {
    const res = await POST(new Request("http://localhost/api/share", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });
});
