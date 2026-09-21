import { describe, expect, it } from "vitest";
import { readLines } from "../raw";
import { flattenResult, toBlocks } from "../blocks";
import { linesToSteps } from "../steps";
import type { RawLine } from "../raw";

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
      { type: "user", uuid: "u9", message: { content: "no timestamp" } },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps.map((s) => s.kind)).toEqual(["system"]);
    expect(warnings).toEqual(["user line u9 has no timestamp, skipped"]);
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
