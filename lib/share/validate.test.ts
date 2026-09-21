import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseClaudeCode } from "@/lib/trace/parsers/claude-code";
import { MAX_TRACE_BYTES, ValidationError, validateTrace } from "./validate";

const real = parseClaudeCode(readFileSync("fixtures/short/main.jsonl", "utf8")).trace;

describe("validateTrace", () => {
  it("accepts a parsed fixture unchanged", () => {
    expect(validateTrace(JSON.parse(JSON.stringify(real)))).toEqual(real);
  });

  it("rejects non objects and missing fields", () => {
    expect(() => validateTrace(null)).toThrow(ValidationError);
    expect(() => validateTrace("x")).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, steps: "nope" })).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, title: 5 })).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, totals: null })).toThrow(ValidationError);
  });

  it("rejects bad steps and duplicate ids", () => {
    expect(() => validateTrace({ ...real, steps: [{ id: "a" }] })).toThrow(ValidationError);
    const dup = { ...real, steps: [real.steps[0], { ...real.steps[1], id: real.steps[0].id }] };
    expect(() => validateTrace(dup)).toThrow(/duplicate/);
    const badKind = { ...real, steps: [{ ...real.steps[0], kind: "alien" }] };
    expect(() => validateTrace(badKind)).toThrow(/kind/);
  });

  it("requires contiguous indexes", () => {
    const gap = { ...real, steps: real.steps.map((s, i) => ({ ...s, index: i === 3 ? 99 : i })) };
    expect(() => validateTrace(gap)).toThrow(/index/);
  });

  it("rejects payloads over the size cap", () => {
    const huge = { ...real, steps: [{ ...real.steps[0], text: "x".repeat(MAX_TRACE_BYTES) }] };
    expect(() => validateTrace(huge)).toThrow(/too large/);
  });

  it("strips unknown top level and step fields", () => {
    const extra = { ...real, evil: 1, steps: [{ ...real.steps[0], evil: 2 }, ...real.steps.slice(1)] };
    const out = validateTrace(extra) as unknown as Record<string, unknown>;
    expect(out.evil).toBeUndefined();
    expect((out.steps as Record<string, unknown>[])[0].evil).toBeUndefined();
  });
});
