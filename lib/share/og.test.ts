import { describe, expect, it } from "vitest";
import { clampTitle, describeTrace, footerLine, kindStrip, toolCallsLabel } from "./og";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (i: number, kind: Step["kind"]): Step => ({ id: `s${i}`, index: i, at: T, agent: "main", kind, durationMs: 1000 });
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Build the thing",
  startedAt: T,
  endedAt: T,
  model: "claude-fable-5",
  totals: { inputTokens: 50_902_560, outputTokens: 279_185, toolCalls: 397, durationMs: 9_900_000 },
  steps: [],
};

describe("clampTitle", () => {
  it("keeps short titles and trims long ones on a word boundary", () => {
    expect(clampTitle("Build the thing", 80)).toBe("Build the thing");
    expect(clampTitle("one two three four five", 12)).toBe("one two...");
    expect(clampTitle("x".repeat(100), 10)).toBe("xxxxxxx...");
  });

  it("does not slice from the end when max is smaller than the ellipsis", () => {
    expect(clampTitle("hello world", 2)).toBe("...");
  });
});

describe("toolCallsLabel", () => {
  it("pluralizes tool call counts", () => {
    expect(toolCallsLabel(1)).toBe("1 tool call");
    expect(toolCallsLabel(2)).toBe("2 tool calls");
  });
});

describe("footerLine", () => {
  it("reports step count and recording date", () => {
    const t = { ...trace, startedAt: "2026-09-21T10:00:00.000Z", steps: [step(0, "user"), step(1, "assistant")] };
    expect(footerLine(t)).toBe("2 steps, recorded Sep 21, 2026");
  });
});

describe("describeTrace", () => {
  it("summarizes steps, tokens, tool calls and duration", () => {
    const t = { ...trace, steps: [step(0, "user"), step(1, "assistant")] };
    expect(describeTrace(t)).toBe("2 steps, 50.9M tokens in, 279k out, 397 tool calls, 2h 45m with claude-fable-5");
  });

  it("omits the model when unknown", () => {
    const t = { ...trace, model: undefined, steps: [step(0, "user")] };
    expect(describeTrace(t)).toBe("1 step, 50.9M tokens in, 279k out, 397 tool calls, 2h 45m");
  });
});

describe("kindStrip", () => {
  it("buckets steps into n cells using the most common kind per cell", () => {
    const steps = [step(0, "user"), step(1, "tool_call"), step(2, "tool_call"), step(3, "assistant")];
    expect(kindStrip(steps, 2)).toEqual(["user", "tool_call"]);
    expect(kindStrip(steps, 4)).toEqual(["user", "tool_call", "tool_call", "assistant"]);
  });

  it("repeats steps when there are fewer steps than cells and handles empty", () => {
    expect(kindStrip([step(0, "user"), step(1, "assistant")], 4)).toEqual(["user", "user", "assistant", "assistant"]);
    expect(kindStrip([], 3)).toEqual(["system", "system", "system"]);
  });
});
