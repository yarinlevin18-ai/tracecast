import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

const { loadSharedTrace } = vi.hoisted(() => ({ loadSharedTrace: vi.fn() }));
vi.mock("@/lib/share/load", () => ({ loadSharedTrace }));
vi.mock("@/components/share/SharedReplay", () => ({ SharedReplay: () => null }));

import { generateMetadata } from "./page";

const trace = {
  id: "t",
  source: "claude-code",
  title: "Hello",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:00:00.000Z",
  model: "m",
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: [
    { id: "a", index: 0, at: "2026-09-21T10:00:00.000Z", agent: "main", kind: "user", text: "hi" },
    { id: "b", index: 1, at: "2026-09-21T10:00:00.000Z", agent: "main", kind: "assistant", text: "yo" },
  ],
};

function meta(id: string): Promise<Metadata> {
  return generateMetadata({ params: Promise.resolve({ id }) });
}

describe("generateMetadata", () => {
  it("describes the trace and points twitter at the og image", async () => {
    loadSharedTrace.mockResolvedValue(trace);
    const m = await meta("AbCdEfGhIjKl");
    expect(m.title).toBe("Hello | Tracecast");
    expect(m.openGraph).toMatchObject({ siteName: "Tracecast", url: "/r/AbCdEfGhIjKl" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    expect((m.twitter as { images?: string[] })?.images).toContain("/r/AbCdEfGhIjKl/opengraph-image");
    expect((m.robots as { index?: boolean })?.index).toBe(false);
  });

  it("falls back to a not-found title and description", async () => {
    loadSharedTrace.mockResolvedValue(null);
    const m = await meta("AbCdEfGhIjKl");
    expect(m.title).toBe("Replay not found | Tracecast");
    expect(m.description).toBeDefined();
  });
});
