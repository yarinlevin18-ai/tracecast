import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeCodeSession } from "../index";

const FIXTURES = join(process.cwd(), "fixtures");

type Line = {
  type?: string;
  isSidechain?: boolean;
  message?: { id?: string; content?: unknown; usage?: Record<string, number> };
};

function loadDir(name: string) {
  const dir = join(FIXTURES, name);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
  const raw: Line[] = files.flatMap((f) =>
    f.text.split("\n").filter(Boolean).map((row) => JSON.parse(row) as Line)
  );
  return { files, raw };
}

/** Counts computed straight from raw JSON. */
function oracle(raw: Line[]) {
  let toolUse = 0;
  let toolResult = 0;
  let outputTokens = 0;
  let inputTokens = 0;
  const seen = new Set<string>();
  for (const l of raw) {
    const blocks = Array.isArray(l.message?.content) ? (l.message!.content as { type: string }[]) : [];
    for (const b of blocks) {
      if (b.type === "tool_use") toolUse++;
      if (b.type === "tool_result") toolResult++;
    }
    if (l.type === "assistant" && l.message?.usage) {
      const id = l.message.id ?? `anon-${seen.size}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const u = l.message.usage;
      outputTokens += u.output_tokens ?? 0;
      inputTokens += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    }
  }
  return { toolUse, toolResult, outputTokens, inputTokens };
}

const dirs = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

describe.each(dirs)("fixture %s", (name) => {
  const { files, raw } = loadDir(name);
  const { trace, warnings } = parseClaudeCodeSession(files);
  const expected = oracle(raw);

  it("produces steps with unique ids in chronological order", () => {
    expect(trace.steps.length).toBeGreaterThan(10);
    expect(new Set(trace.steps.map((s) => s.id)).size).toBe(trace.steps.length);
    for (let i = 1; i < trace.steps.length; i++) {
      expect(Date.parse(trace.steps[i].at)).toBeGreaterThanOrEqual(Date.parse(trace.steps[i - 1].at));
      expect(trace.steps[i].index).toBe(i);
    }
    expect(trace.steps.every((s) => (s.durationMs ?? 0) >= 0)).toBe(true);
  });

  it("emits one tool_call per tool_use block and one tool_result per tool_result block", () => {
    expect(trace.steps.filter((s) => s.kind === "tool_call")).toHaveLength(expected.toolUse);
    expect(trace.steps.filter((s) => s.kind === "tool_result")).toHaveLength(expected.toolResult);
    expect(trace.totals.toolCalls).toBe(expected.toolUse);
  });

  it("pairs every tool_result to a tool_call", () => {
    const callIds = new Set(trace.steps.filter((s) => s.kind === "tool_call").map((s) => s.tool!.callId));
    const orphans = trace.steps.filter((s) => s.kind === "tool_result" && !callIds.has(s.result!.callId));
    expect(orphans).toEqual([]);
    expect(warnings.filter((w) => w.includes("no matching tool_call"))).toEqual([]);
  });

  it("sums tokens once per message id", () => {
    expect(trace.totals.outputTokens).toBe(expected.outputTokens);
    expect(trace.totals.inputTokens).toBe(expected.inputTokens);
    expect(trace.totals.outputTokens).toBeGreaterThan(0);
  });

  it("has a title, model, and a positive duration", () => {
    expect(trace.title).not.toBe("Untitled session");
    expect(trace.title.length).toBeLessThanOrEqual(80);
    expect(trace.model).toMatch(/^claude/);
    expect(trace.totals.durationMs).toBeGreaterThan(0);
    expect(Date.parse(trace.endedAt) - Date.parse(trace.startedAt)).toBe(trace.totals.durationMs);
  });

  it("links subagent files to their Agent call", () => {
    const hasSub = files.some((f) => f.name.startsWith("agent-"));
    const subSteps = trace.steps.filter((s) => s.agent !== "main");
    if (!hasSub) {
      expect(subSteps).toEqual([]);
      return;
    }
    expect(subSteps.length).toBeGreaterThan(0);
    expect(subSteps.every((s) => s.parentId !== undefined)).toBe(true);
    expect(warnings.filter((w) => w.includes("no matching Agent call"))).toEqual([]);
  });

  it("does not emit meta or command-echo user steps", () => {
    const users = trace.steps.filter((s) => s.kind === "user");
    expect(users.some((s) => /^<command-|^<local-command-|^<system-reminder/.test(s.text ?? ""))).toBe(false);
  });
});
