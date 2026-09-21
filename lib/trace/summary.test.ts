import { describe, expect, it } from "vitest";
import { toolSummary } from "./summary";

describe("toolSummary", () => {
  it("shows the path for file tools", () => {
    expect(toolSummary({ name: "Read", input: { file_path: "/Users/dev/app/page.tsx" }, callId: "c" })).toBe("/Users/dev/app/page.tsx");
    expect(toolSummary({ name: "Edit", input: { file_path: "a.ts", old_string: "x" }, callId: "c" })).toBe("a.ts");
    expect(toolSummary({ name: "Write", input: { file_path: "b.ts" }, callId: "c" })).toBe("b.ts");
  });

  it("shows the first line of a Bash command", () => {
    expect(toolSummary({ name: "Bash", input: { command: "npm test\necho done" }, callId: "c" })).toBe("npm test");
  });

  it("shows pattern for Grep and Glob, description for Agent, skill name for Skill", () => {
    expect(toolSummary({ name: "Grep", input: { pattern: "TODO", path: "src" }, callId: "c" })).toBe("TODO in src");
    expect(toolSummary({ name: "Glob", input: { pattern: "**/*.ts" }, callId: "c" })).toBe("**/*.ts");
    expect(toolSummary({ name: "Agent", input: { description: "Review captions", prompt: "..." }, callId: "c" })).toBe("Review captions");
    expect(toolSummary({ name: "Skill", input: { skill: "brainstorming" }, callId: "c" })).toBe("brainstorming");
  });

  it("falls back to compact JSON, truncated to 80 chars", () => {
    const s = toolSummary({ name: "Other", input: { a: "x".repeat(200) }, callId: "c" });
    expect(s.length).toBe(80);
    expect(s.endsWith("...")).toBe(true);
    expect(toolSummary({ name: "Other", input: {}, callId: "c" })).toBe("");
  });
});
