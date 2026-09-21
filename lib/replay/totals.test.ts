import { describe, expect, it } from "vitest";
import { cumulativeTotals } from "./totals";
import type { Step } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });

describe("cumulativeTotals", () => {
  it("accumulates tokens and tool calls per step index", () => {
    const t = cumulativeTotals([
      step({ id: "a", kind: "user" }),
      step({ id: "b", kind: "assistant", tokens: { input: 100, output: 10 } }),
      step({ id: "c", kind: "tool_call", tool: { name: "Read", input: {}, callId: "x" } }),
      step({ id: "d", kind: "assistant", tokens: { input: 50, output: 5 } }),
    ]);
    expect(t.input).toEqual([0, 100, 100, 150]);
    expect(t.output).toEqual([0, 10, 10, 15]);
    expect(t.toolCalls).toEqual([0, 0, 1, 1]);
  });

  it("handles no steps", () => {
    expect(cumulativeTotals([])).toEqual({ input: [], output: [], toolCalls: [] });
  });
});
