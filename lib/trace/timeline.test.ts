import { describe, expect, it } from "vitest";
import { buildTimeline, shouldVirtualize } from "./timeline";
import type { Step, Trace } from "./types";

const T = "2026-09-21T10:00:00.000Z";

function step(partial: Partial<Step> & Pick<Step, "id" | "kind">): Step {
  return { index: 0, at: T, agent: "main", durationMs: 0, ...partial };
}

function trace(steps: Step[]): Trace {
  return {
    id: "t",
    source: "claude-code",
    title: "t",
    startedAt: T,
    endedAt: T,
    totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
    steps: steps.map((s, index) => ({ ...s, index })),
  };
}

describe("buildTimeline", () => {
  it("folds each tool_result into its call and keeps orphans", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "u", kind: "user", text: "hi" }),
        step({ id: "c1", kind: "tool_call", tool: { name: "Read", input: {}, callId: "call-1" } }),
        step({ id: "r1", kind: "tool_result", result: { callId: "call-1", output: "ok", isError: false } }),
        step({ id: "r2", kind: "tool_result", result: { callId: "missing", output: "?", isError: true } }),
      ])
    );
    expect(rows.map((r) => r.step.id)).toEqual(["u", "c1", "r2"]);
    expect(rows[1].result?.output).toBe("ok");
    expect(rows[2].result).toBeUndefined();
  });

  it("marks subagent steps as depth 1", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "a", kind: "tool_call", tool: { name: "Agent", input: {}, callId: "agent-1" } }),
        step({ id: "s", kind: "user", agent: "Reviewer", parentId: "a", text: "go" }),
      ])
    );
    expect(rows.map((r) => r.depth)).toEqual([0, 1]);
  });

  it("uses step ids as row keys", () => {
    const rows = buildTimeline(trace([step({ id: "x", kind: "system", text: "Context compacted" })]));
    expect(rows[0].key).toBe("x");
  });

  it("leaves result undefined for a tool_call with no matching result", () => {
    const rows = buildTimeline(
      trace([step({ id: "c1", kind: "tool_call", tool: { name: "Read", input: {}, callId: "call-1" } })])
    );
    expect(rows[0].result).toBeUndefined();
  });

  it("keeps the first result when two tool_results share a callId", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "c1", kind: "tool_call", tool: { name: "Read", input: {}, callId: "call-1" } }),
        step({ id: "r1", kind: "tool_result", result: { callId: "call-1", output: "first", isError: false } }),
        step({ id: "r2", kind: "tool_result", result: { callId: "call-1", output: "second", isError: false } }),
      ])
    );
    expect(rows.map((r) => r.step.id)).toEqual(["c1"]);
    expect(rows[0].result?.output).toBe("first");
  });
});

describe("shouldVirtualize", () => {
  it("kicks in above 300 rows", () => {
    expect(shouldVirtualize(300)).toBe(false);
    expect(shouldVirtualize(301)).toBe(true);
  });
});
