import { describe, expect, it } from "vitest";
import { redactTrace } from "./redact";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });
const trace = (steps: Step[]): Trace => ({
  id: "t",
  source: "claude-code",
  title: "Set OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz please",
  startedAt: T,
  endedAt: T,
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: steps.map((s, index) => ({ ...s, index })),
});

describe("redactTrace", () => {
  it("redacts text, tool input strings and outputs, and reports hits per step", () => {
    const { trace: out, hits } = redactTrace(
      trace([
        step({ id: "u", kind: "user", text: "my key is sk-abcdefghijklmnopqrstuvwxyz" }),
        step({ id: "c", kind: "tool_call", tool: { name: "Bash", input: { command: "cat /Users/alice/.env", nested: { token: "ghp_abcdefghijklmnopqrstuvwxyz" } }, callId: "1" } }),
        step({ id: "r", kind: "tool_result", result: { callId: "1", output: "AWS_SECRET=abc123 done", isError: false } }),
        step({ id: "ok", kind: "assistant", text: "nothing secret here" }),
      ])
    );
    expect(out.title).toBe("Set OPENAI_API_KEY=REDACTED please");
    expect(out.steps[0].text).toBe("my key is sk-REDACTED");
    expect((out.steps[1].tool!.input as { command: string; nested: { token: string } }).command).toBe("cat /Users/dev/.env");
    expect((out.steps[1].tool!.input as { nested: { token: string } }).nested.token).toBe("gh_REDACTED");
    expect(out.steps[2].result!.output).toBe("AWS_SECRET=REDACTED done");
    expect(out.steps[3].text).toBe("nothing secret here");
    expect(hits.map((h) => h.stepId)).toEqual(["u", "c", "r"]);
    expect(hits[1].patterns).toEqual(expect.arrayContaining(["home-dir-any", "github"]));
    expect(hits[1].fields).toEqual(["tool.input"]);
  });

  it("does not mutate the input and leaves non string input values alone", () => {
    const original = trace([step({ id: "c", kind: "tool_call", tool: { name: "X", input: { n: 3, list: ["sk-abcdefghijklmnopqrstuvwxyz", 4] }, callId: "1" } })]);
    const copy = JSON.parse(JSON.stringify(original));
    const { trace: out } = redactTrace(original);
    expect(original).toEqual(copy);
    expect((out.steps[0].tool!.input as { n: number; list: unknown[] }).n).toBe(3);
    expect((out.steps[0].tool!.input as { list: unknown[] }).list).toEqual(["sk-REDACTED", 4]);
  });

  it("returns no hits for a clean trace", () => {
    expect(redactTrace(trace([step({ id: "u", kind: "user", text: "hello" })])).hits).toEqual([]);
  });

  it("redacts a personal path in step.agent", () => {
    const { trace: out, hits } = redactTrace(trace([step({ id: "s", kind: "subagent", agent: "explore /Users/alice/repo" })]));
    expect(out.steps[0].agent).toBe("explore /Users/dev/repo");
    expect(hits).toHaveLength(1);
    expect(hits[0].fields).toContain("agent");
  });

  it("skips a __proto__ key from JSON.parse instead of reassigning the prototype", () => {
    const input = JSON.parse('{"__proto__":{"x":1},"a":"b"}');
    const { trace: out } = redactTrace(trace([step({ id: "c", kind: "tool_call", tool: { name: "X", input, callId: "1" } })]));
    const result = out.steps[0].tool!.input as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.x).toBeUndefined();
    expect(result.a).toBe("b");
  });
});
