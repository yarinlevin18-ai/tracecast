// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceHeader } from "./TraceHeader";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Fix the flaky test",
  model: "claude-fable-5",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:01:05.000Z",
  totals: { inputTokens: 50902560, outputTokens: 279185, toolCalls: 397, durationMs: 65000 },
  steps: [],
};

describe("TraceHeader", () => {
  it("shows title, model and formatted totals", () => {
    render(<TraceHeader trace={trace} agentCount={6} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Fix the flaky test");
    expect(screen.getByText("claude-fable-5")).toBeTruthy();
    expect(screen.getByText("50.9M in")).toBeTruthy();
    expect(screen.getByText("279k out")).toBeTruthy();
    expect(screen.getByText("397 tool calls")).toBeTruthy();
    expect(screen.getByText("1m 5s")).toBeTruthy();
    expect(screen.getByText("6 agents")).toBeTruthy();
  });
});
