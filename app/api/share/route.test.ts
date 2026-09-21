import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadTrace, getAdminClient, checkAndRecordShare } = vi.hoisted(() => ({
  uploadTrace: vi.fn(),
  getAdminClient: vi.fn(),
  checkAndRecordShare: vi.fn(),
}));
vi.mock("@/lib/share/store", async (orig) => ({ ...(await orig<typeof import("@/lib/share/store")>()), uploadTrace }));
vi.mock("@/lib/share/ratelimit", async (orig) => ({ ...(await orig<typeof import("@/lib/share/ratelimit")>()), checkAndRecordShare }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient,
  SharingNotConfigured: class SharingNotConfigured extends Error {},
}));

import { POST } from "./route";
import { SharingNotConfigured } from "@/lib/supabase/admin";
import { hashIp } from "@/lib/share/ratelimit";

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
    checkAndRecordShare.mockReset();
    checkAndRecordShare.mockResolvedValue({ allowed: true, remaining: 9 });
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

  it("answers 413 when content-length says the body is too large", async () => {
    const res = await POST(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({ trace }),
        headers: { "content-type": "application/json", "content-length": "99999999" },
      })
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("trace is too large to share");
  });

  it("answers 502 when the upload throws", async () => {
    uploadTrace.mockRejectedValue(new Error("boom"));
    const res = await post({ trace, expiresInDays: null });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upload failed, try again");
  });

  it("answers 429 when the rate limit is exceeded", async () => {
    checkAndRecordShare.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await post({ trace, expiresInDays: null });
    expect(res.status).toBe(429);
    expect(typeof (await res.json()).error).toBe("string");
    expect(uploadTrace).not.toHaveBeenCalled();
  });

  it("hashes the first forwarded ip for the rate limiter", async () => {
    uploadTrace.mockResolvedValue({ id: "AbCdEfGhIjKl", expiresAt: null });
    await POST(
      new Request("http://localhost/api/share", {
        method: "POST",
        body: JSON.stringify({ trace, expiresInDays: null }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      })
    );
    expect(checkAndRecordShare).toHaveBeenCalledWith(expect.anything(), hashIp("203.0.113.9", "tracecast"));
  });
});
