import { describe, expect, it } from "vitest";
import { editStepText, removeSteps } from "./edit";
import type { Step, Trace } from "@/lib/trace/types";

const at = (s: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, s)).toISOString();
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: at(0), agent: "main", ...p });
const trace = (steps: Step[]): Trace => ({
  id: "t",
  source: "claude-code",
  title: "t",
  startedAt: at(0),
  endedAt: at(30),
  totals: { inputTokens: 100, outputTokens: 10, toolCalls: 1, durationMs: 30000 },
  steps: steps.map((s, index) => ({ ...s, index })),
});

const base = trace([
  step({ id: "a", kind: "user", at: at(0), durationMs: 10000, text: "hi" }),
  step({ id: "b", kind: "tool_call", at: at(10), durationMs: 10000, tool: { name: "Read", input: {}, callId: "c" } }),
  step({ id: "c", kind: "tool_result", at: at(20), durationMs: 10000, result: { callId: "c", output: "x", isError: false } }),
  step({ id: "d", kind: "assistant", at: at(30), durationMs: 0, text: "bye", tokens: { input: 100, output: 10 } }),
]);

describe("removeSteps", () => {
  it("drops steps, re-indexes, folds the gap into the previous step and recomputes totals", () => {
    const out = removeSteps(base, new Set(["b", "c"]));
    expect(out.steps.map((s) => [s.id, s.index, s.durationMs])).toEqual([
      ["a", 0, 30000],
      ["d", 1, 0],
    ]);
    expect(out.totals).toEqual({ inputTokens: 100, outputTokens: 10, toolCalls: 0, durationMs: 30000 });
    expect(out.startedAt).toBe(at(0));
    expect(out.endedAt).toBe(at(30));
    expect(base.steps).toHaveLength(4);
  });

  it("removing the first step moves startedAt", () => {
    const out = removeSteps(base, new Set(["a"]));
    expect(out.startedAt).toBe(at(10));
    expect(out.totals.durationMs).toBe(20000);
    expect(out.steps[0].durationMs).toBe(10000);
  });

  it("removing everything yields an empty trace", () => {
    const out = removeSteps(base, new Set(["a", "b", "c", "d"]));
    expect(out.steps).toEqual([]);
    expect(out.totals.durationMs).toBe(0);
  });
});

describe("editStepText", () => {
  it("replaces text or output on one step without touching others", () => {
    const out = editStepText(base, "a", "text", "hello");
    expect(out.steps[0].text).toBe("hello");
    expect(out.steps[3].text).toBe("bye");
    const out2 = editStepText(base, "c", "result.output", "y");
    expect(out2.steps[2].result?.output).toBe("y");
    expect(editStepText(base, "zzz", "text", "no")).toBe(base);
  });
});
