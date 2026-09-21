import { describe, expect, it } from "vitest";
import { readLines } from "../raw";
import { flattenResult, toBlocks } from "../blocks";

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
