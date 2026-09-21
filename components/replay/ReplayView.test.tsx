// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReplayView } from "./ReplayView";
import type { Trace } from "@/lib/trace/types";

const T = (s: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, s)).toISOString();
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Replay me",
  startedAt: T(0),
  endedAt: T(30),
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 1, durationMs: 30000 },
  steps: [
    { id: "s0", index: 0, at: T(0), agent: "main", kind: "user", text: "first", durationMs: 10000 },
    { id: "s1", index: 1, at: T(10), agent: "main", kind: "tool_call", tool: { name: "Read", input: {}, callId: "c" }, durationMs: 10000 },
    { id: "s2", index: 2, at: T(20), agent: "main", kind: "tool_result", result: { callId: "c", output: "ok", isError: false }, durationMs: 10000 },
    { id: "s3", index: 3, at: T(30), agent: "main", kind: "assistant", text: "last", durationMs: 0 },
  ],
};

describe("ReplayView", () => {
  it("starts on the first step and reveals more as you step forward", () => {
    render(<ReplayView trace={trace} warnings={[]} />);
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.queryByText("last")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("running")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.queryByText("running")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("last")).toBeTruthy();
  });

  it("responds to keyboard navigation", () => {
    render(<ReplayView trace={trace} warnings={[]} />);
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByText("last")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Home" });
    expect(screen.queryByText("last")).toBeNull();
  });
});
