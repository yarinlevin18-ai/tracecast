import { describe, expect, it } from "vitest";
import { readLines } from "../raw";
import { flattenResult, toBlocks } from "../blocks";
import { linesToSteps } from "../steps";
import type { RawLine } from "../raw";
import { parseClaudeCode, parseClaudeCodeSession } from "../index";

describe("readLines", () => {
  it("parses one object per line and skips bad lines with a warning", () => {
    const text = [
      JSON.stringify({ type: "user", uuid: "a" }),
      "",
      "{ not json",
      "[1,2]",
      JSON.stringify({ type: "assistant", uuid: "b" }),
    ].join("\n");

    const { lines, warnings } = readLines(text);

    expect(lines.map((l) => l.uuid)).toEqual(["a", "b"]);
    expect(warnings).toEqual([
      "line 3: invalid JSON, skipped",
      "line 4: not an object, skipped",
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = JSON.stringify({ uuid: "a" }) + "\r\n" + JSON.stringify({ uuid: "b" }) + "\r\n";
    const { lines, warnings } = readLines(text);
    expect(lines.map((l) => l.uuid)).toEqual(["a", "b"]);
    expect(warnings).toEqual([]);
  });
});

describe("toBlocks", () => {
  it("wraps string content as a single text block", () => {
    expect(toBlocks("hi")).toEqual([{ type: "text", text: "hi" }]);
  });

  it("passes arrays through and drops non-objects", () => {
    expect(toBlocks([{ type: "text", text: "a" }, null as never, "x" as never])).toEqual([
      { type: "text", text: "a" },
    ]);
  });

  it("returns [] for undefined", () => {
    expect(toBlocks(undefined)).toEqual([]);
  });
});

describe("flattenResult", () => {
  it("keeps strings", () => {
    expect(flattenResult("out")).toBe("out");
  });

  it("joins text blocks and marks images", () => {
    expect(
      flattenResult([
        { type: "text", text: "line 1" },
        { type: "image", source: {} },
        { type: "text", text: "line 2" },
      ])
    ).toBe("line 1\n[image]\nline 2");
  });

  it("stringifies other JSON", () => {
    expect(flattenResult({ a: 1 })).toBe('{"a":1}');
    expect(flattenResult(null)).toBe("");
  });
});

const T0 = "2026-09-21T10:00:00.000Z";
const T1 = "2026-09-21T10:00:01.000Z";
const T2 = "2026-09-21T10:00:02.000Z";

const usage = {
  input_tokens: 2,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 300,
  output_tokens: 40,
};

describe("linesToSteps", () => {
  it("merges a split assistant message and counts usage once", () => {
    const lines: RawLine[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: T0,
        message: { id: "msg_1", model: "claude-x", content: [{ type: "thinking", thinking: "hmm" }], usage },
      },
      {
        type: "assistant",
        uuid: "a2",
        timestamp: T1,
        message: { id: "msg_1", model: "claude-x", content: [{ type: "text", text: "Hello" }], usage },
      },
      {
        type: "assistant",
        uuid: "a3",
        timestamp: T2,
        message: {
          id: "msg_1",
          content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { path: "x" } }],
          usage,
        },
      },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps.map((s) => s.kind)).toEqual(["thinking", "assistant", "tool_call"]);
    expect(steps[0].tokens).toEqual({ input: 402, output: 40 });
    expect(steps[1].tokens).toBeUndefined();
    expect(steps[2].tool).toEqual({ name: "Read", input: { path: "x" }, callId: "toolu_1" });
    expect(steps.every((s) => s.agent === "main")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("emits tool_result steps from user lines and flattens content", () => {
    const lines: RawLine[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: T0,
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "ok" }] },
            { type: "tool_result", tool_use_id: "toolu_2", content: "boom", is_error: true },
          ],
        },
      },
    ];
    const steps = linesToSteps(lines, "main", []);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ id: "u1:0", kind: "tool_result", result: { callId: "toolu_1", output: "ok", isError: false } });
    expect(steps[1]).toMatchObject({ id: "u1:1", result: { callId: "toolu_2", output: "boom", isError: true } });
  });

  it("keeps human prompts, skips meta and command echoes, and maps compact summaries to system", () => {
    const lines: RawLine[] = [
      { type: "user", uuid: "u1", timestamp: T0, message: { content: "Fix the bug" } },
      { type: "user", uuid: "u2", timestamp: T0, isMeta: true, message: { content: "injected context" } },
      { type: "user", uuid: "u3", timestamp: T0, message: { content: "<command-name>/clear</command-name>" } },
      { type: "user", uuid: "u4", timestamp: T1, isCompactSummary: true, message: { content: "Summary of earlier work" } },
      { type: "user", uuid: "u5", timestamp: T1, message: { content: [{ type: "image" }, { type: "text", text: "  see this  " }] } },
    ];
    const steps = linesToSteps(lines, "main", []);

    expect(steps.map((s) => [s.kind, s.text])).toEqual([
      ["user", "Fix the bug"],
      ["system", "Context compacted"],
      ["user", "[image]"],
      ["user", "see this"],
    ]);
  });

  it("skips unknown line types and non compact_boundary system lines", () => {
    const lines: RawLine[] = [
      { type: "attachment", uuid: "x", timestamp: T0 },
      { type: "system", uuid: "s1", timestamp: T0, subtype: "api_error" },
      { type: "system", uuid: "s2", timestamp: T1, subtype: "compact_boundary" },
      { type: "system", uuid: "s3", subtype: "compact_boundary" },
      { type: "user", uuid: "u9", message: { content: "no timestamp" } },
      { type: "user", uuid: "u10", timestamp: "not a date", message: { content: "bad time" } },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps.map((s) => s.kind)).toEqual(["system"]);
    expect(warnings).toEqual([
      "system line s3 has no timestamp, skipped",
      "user line u9 has no timestamp, skipped",
      "user line u10 has no timestamp, skipped",
    ]);
  });

  it("warns on unknown block types", () => {
    const warnings: string[] = [];
    linesToSteps(
      [{ type: "assistant", uuid: "a1", timestamp: T0, message: { id: "m", content: [{ type: "weird" }] } }],
      "main",
      warnings
    );
    expect(warnings).toEqual(['assistant line a1: unknown block type "weird"']);
  });

  it("folds usage from empty messages into the last step with a warning", () => {
    const lines: RawLine[] = [
      { type: "assistant", uuid: "a1", timestamp: T0, message: { id: "m1", content: [{ type: "text", text: "Hi" }], usage: { input_tokens: 1, output_tokens: 1 } } },
      { type: "assistant", uuid: "a2", timestamp: T1, message: { id: "m2", content: [], usage: { input_tokens: 5, output_tokens: 6 } } },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps).toHaveLength(1);
    expect(steps[0].tokens).toEqual({ input: 6, output: 7 });
    expect(warnings).toEqual(["1 message(s) had usage but no content; tokens added to step a1:0"]);
  });
});

function jsonl(objs: object[]): string {
  return objs.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

describe("parseClaudeCodeSession", () => {
  const mainText = jsonl([
    { type: "user", uuid: "u1", timestamp: T0, sessionId: "sess-1", message: { content: "Review the   caption   treatment please" } },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: T1,
      message: {
        id: "m1",
        model: "claude-x",
        content: [{ type: "tool_use", id: "toolu_agent", name: "Agent", input: { description: "Review captions", prompt: "..." } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
    {
      type: "user",
      uuid: "u2",
      timestamp: "2026-09-21T10:00:05.000Z",
      toolUseResult: { agentId: "abc123", status: "done" },
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_agent", content: "done" }] },
    },
    {
      type: "user",
      uuid: "u3",
      timestamp: "2026-09-21T10:00:06.000Z",
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_missing", content: "orphan" }] },
    },
  ]);

  const subText = jsonl([
    { type: "user", uuid: "s1", timestamp: T2, isSidechain: true, agentId: "abc123", message: { content: "Review captions" } },
    {
      type: "assistant",
      uuid: "s2",
      timestamp: "2026-09-21T10:00:03.000Z",
      isSidechain: true,
      agentId: "abc123",
      message: { id: "m2", content: [{ type: "text", text: "Looks good" }], usage: { input_tokens: 7, output_tokens: 3 } },
    },
  ]);

  it("merges subagent steps by time with parentId and agent name", () => {
    const { trace, warnings } = parseClaudeCodeSession([
      { name: "abc.jsonl", text: mainText },
      { name: "agent-abc123.jsonl", text: subText },
    ]);

    expect(trace.id).toBe("sess-1");
    expect(trace.source).toBe("claude-code");
    expect(trace.model).toBe("claude-x");
    expect(trace.title).toBe("Review the caption treatment please");
    expect(trace.steps.map((s) => [s.index, s.kind, s.agent])).toEqual([
      [0, "user", "main"],
      [1, "tool_call", "main"],
      [2, "user", "Review captions"],
      [3, "assistant", "Review captions"],
      [4, "tool_result", "main"],
      [5, "tool_result", "main"],
    ]);
    expect(trace.steps[2].parentId).toBe("a1:0");
    expect(trace.steps[3].parentId).toBe("a1:0");
    expect(trace.steps[1].parentId).toBeUndefined();
    expect(trace.steps.map((s) => s.durationMs)).toEqual([1000, 1000, 1000, 2000, 1000, 0]);
    expect(trace.startedAt).toBe(T0);
    expect(trace.endedAt).toBe("2026-09-21T10:00:06.000Z");
    expect(trace.totals).toEqual({ inputTokens: 17, outputTokens: 8, toolCalls: 1, durationMs: 6000 });
    expect(warnings).toEqual(["tool_result u3:0 has no matching tool_call (toolu_missing)"]);
  });

  it("parseClaudeCode handles a single file", () => {
    const { trace } = parseClaudeCode(mainText);
    expect(trace.steps).toHaveLength(4);
    expect(trace.steps.every((s) => s.agent === "main")).toBe(true);
  });

  it("returns an empty trace with a warning when nothing parses", () => {
    const { trace, warnings } = parseClaudeCode("not json\n");
    expect(trace.steps).toEqual([]);
    expect(trace.title).toBe("Untitled session");
    expect(warnings).toContain("no steps found");
  });

  it("truncates long titles to 80 chars", () => {
    const { trace } = parseClaudeCode(
      jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "x".repeat(200) } }])
    );
    expect(trace.title).toHaveLength(80);
    expect(trace.title.endsWith("...")).toBe(true);
  });

  it("warns when a subagent file has no matching Agent call", () => {
    const { trace, warnings } = parseClaudeCodeSession([
      { name: "main.jsonl", text: jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "hi" } }]) },
      { name: "agent-zzz.jsonl", text: subText },
    ]);
    expect(warnings).toContain("agent-zzz.jsonl: no matching Agent call in main session (abc123)");
    expect(trace.steps.filter((s) => s.agent === "abc123")).toHaveLength(2);
  });

  it("picks the Agent tool_result among several batched in one line", () => {
    const main = jsonl([
      {
        type: "assistant",
        uuid: "a1",
        timestamp: T0,
        message: {
          id: "m1",
          content: [
            { type: "tool_use", id: "toolu_read", name: "Read", input: { path: "x" } },
            { type: "tool_use", id: "toolu_agent2", name: "Agent", input: { description: "Sub work" } },
          ],
        },
      },
      {
        type: "user",
        uuid: "u1",
        timestamp: T1,
        toolUseResult: { agentId: "xyz" },
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_read", content: "file contents" },
            { type: "tool_result", tool_use_id: "toolu_agent2", content: "done" },
          ],
        },
      },
    ]);
    const sub = jsonl([
      { type: "user", uuid: "s1", timestamp: T2, isSidechain: true, agentId: "xyz", message: { content: "go" } },
    ]);

    const { trace } = parseClaudeCodeSession([
      { name: "main.jsonl", text: main },
      { name: "agent-xyz.jsonl", text: sub },
    ]);

    const subStep = trace.steps.find((s) => s.agent === "Sub work");
    expect(subStep).toBeDefined();
    expect(subStep?.parentId).toBe("a1:1");
  });

  it("treats a file with an isSidechain first line as a subagent regardless of name", () => {
    const { trace } = parseClaudeCodeSession([
      { name: "main.jsonl", text: jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "hi" } }]) },
      { name: "other.jsonl", text: subText },
    ]);
    expect(trace.steps.some((s) => s.agent === "main" && s.text === "Review captions")).toBe(false);
    expect(trace.steps.filter((s) => s.agent === "abc123")).toHaveLength(2);
  });

  it("never picks a subagent prompt as the trace title", () => {
    const main = jsonl([
      {
        type: "assistant",
        uuid: "a1",
        timestamp: T0,
        message: { id: "m1", content: [{ type: "tool_use", id: "toolu_agent", name: "Agent", input: { description: "Do sub work" } }] },
      },
      {
        type: "user",
        uuid: "u2",
        timestamp: T1,
        toolUseResult: { agentId: "foo" },
        message: { content: [{ type: "tool_result", tool_use_id: "toolu_agent", content: "done" }] },
      },
    ]);
    const sub = jsonl([
      { type: "user", uuid: "s1", timestamp: T2, isSidechain: true, agentId: "foo", message: { content: "Sub prompt text" } },
    ]);

    const { trace } = parseClaudeCodeSession([
      { name: "main.jsonl", text: main },
      { name: "agent-foo.jsonl", text: sub },
    ]);

    expect(trace.title).toBe("Untitled session");
  });

  it("warns when multiple main session files are given", () => {
    const { warnings } = parseClaudeCodeSession([
      { name: "one.jsonl", text: jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "hi" } }]) },
      { name: "two.jsonl", text: jsonl([{ type: "user", uuid: "u2", timestamp: T1, message: { content: "hey" } }]) },
    ]);
    expect(warnings.some((w) => w.startsWith("multiple main session files given, using "))).toBe(true);
  });
});
