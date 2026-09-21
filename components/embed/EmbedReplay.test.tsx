// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbedReplay } from "./EmbedReplay";
import type { Trace } from "@/lib/trace/types";

const T = (s: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, s)).toISOString();
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Embed me",
  startedAt: T(0),
  endedAt: T(10),
  model: "claude-x",
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 10000 },
  steps: [
    { id: "s0", index: 0, at: T(0), agent: "main", kind: "user", text: "first", durationMs: 10000 },
    { id: "s1", index: 1, at: T(10), agent: "main", kind: "assistant", text: "last", durationMs: 0 },
  ],
};

describe("EmbedReplay", () => {
  it("links to the full replay and hides the model chip in compact mode", () => {
    render(<EmbedReplay trace={trace} shareUrl="/r/AbCdEfGhIjKl" autoplay={false} />);
    const link = screen.getByRole("link", { name: "Open replay" });
    expect(link.getAttribute("href")).toBe("/r/AbCdEfGhIjKl");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText("claude-x")).toBeNull();
  });
});
