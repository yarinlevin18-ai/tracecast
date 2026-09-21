import { describe, expect, it } from "vitest";
import { readLines } from "../raw";

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
});
