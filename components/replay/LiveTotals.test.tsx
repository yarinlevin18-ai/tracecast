// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveTotals } from "./LiveTotals";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Fix the flaky test",
  model: "claude-fable-5",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:10:00.000Z",
  totals: { inputTokens: 300, outputTokens: 30, toolCalls: 2, durationMs: 600000 },
  steps: [
    { id: "a", index: 0, at: "2026-09-21T10:00:00.000Z", agent: "main", kind: "user", text: "go" },
    { id: "b", index: 1, at: "2026-09-21T10:01:05.000Z", agent: "main", kind: "assistant", tokens: { input: 300, output: 30 } },
  ],
};

describe("LiveTotals", () => {
  it("shows the title and the elapsed session time at the current step", () => {
    render(<LiveTotals trace={trace} index={1} totals={{ input: [0, 300], output: [0, 30], toolCalls: [0, 0] }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Fix the flaky test");
    expect(screen.getByText("1m 5s")).toBeTruthy();
    expect(screen.getByText(/tool calls/)).toBeTruthy();
  });
});
