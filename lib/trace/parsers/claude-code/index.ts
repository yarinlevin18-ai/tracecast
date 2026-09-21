import type { DraftStep, ParseResult, SessionFile, Step, Trace } from "@/lib/trace/types";
import { toBlocks } from "./blocks";
import { readLines, type RawLine } from "./raw";
import { linesToSteps } from "./steps";

const TITLE_MAX = 80;
const UNTITLED = "Untitled session";

type ParsedFile = { name: string; lines: RawLine[] };

function isSubagentFile(file: ParsedFile): boolean {
  if (/^agent-.*\.jsonl$/i.test(file.name)) return true;
  const first = file.lines.find((l) => l.type === "user" || l.type === "assistant");
  return first?.isSidechain === true;
}

function makeTitle(steps: DraftStep[]): string {
  const first = steps.find((s) => s.agent === "main" && s.kind === "user" && s.text && s.text !== "[image]");
  if (!first?.text) return UNTITLED;
  const flat = first.text.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? flat.slice(0, TITLE_MAX - 3) + "..." : flat;
}

/** Map agentId -> the main-session tool_call step that spawned it. */
function findAgentCalls(mainLines: RawLine[], mainSteps: DraftStep[]): Map<string, DraftStep> {
  const callsById = new Map<string, DraftStep>();
  for (const s of mainSteps) if (s.kind === "tool_call" && s.tool) callsById.set(s.tool.callId, s);

  const out = new Map<string, DraftStep>();
  for (const line of mainLines) {
    const result = line.toolUseResult as { agentId?: unknown } | undefined;
    if (typeof result?.agentId !== "string") continue;
    const block = toBlocks(line.message?.content).find(
      (b) => b.type === "tool_result" && callsById.get(b.tool_use_id ?? "")?.tool?.name === "Agent"
    );
    const call = block?.tool_use_id ? callsById.get(block.tool_use_id) : undefined;
    if (call) out.set(result.agentId, call);
  }
  return out;
}

function agentDisplayName(call: DraftStep | undefined, agentId: string): string {
  const input = call?.tool?.input as { description?: unknown } | undefined;
  return typeof input?.description === "string" && input.description.trim() ? input.description.trim() : agentId;
}

export function parseClaudeCodeSession(files: SessionFile[]): ParseResult {
  const warnings: string[] = [];
  const parsed: ParsedFile[] = files.map((f) => {
    const { lines, warnings: w } = readLines(f.text);
    warnings.push(...w.map((msg) => `${f.name}: ${msg}`));
    return { name: f.name, lines };
  });

  const subs: ParsedFile[] = [];
  const mains: ParsedFile[] = [];
  for (const p of parsed) (isSubagentFile(p) ? subs : mains).push(p);
  if (mains.length > 1) warnings.push(`multiple main session files given, using ${mains[0].name}`);
  const main: ParsedFile = mains[0] ?? { name: "main", lines: [] };

  const draft = linesToSteps(main.lines, "main", warnings);
  const agentCalls = findAgentCalls(main.lines, draft);

  for (const sub of subs) {
    const agentId = sub.lines.find((l) => typeof l.agentId === "string")?.agentId ?? sub.name.replace(/^agent-|\.jsonl$/gi, "");
    const call = agentCalls.get(agentId);
    if (!call) warnings.push(`${sub.name}: no matching Agent call in main session (${agentId})`);
    const name = agentDisplayName(call, agentId);
    const subSteps = linesToSteps(sub.lines, name, warnings);
    if (call && subSteps.some((s) => Date.parse(s.at) < Date.parse(call.at))) {
      warnings.push(`${sub.name}: steps start before their Agent call ${call.id}, clock skew between files`);
    }
    for (const s of subSteps) draft.push(call ? { ...s, parentId: call.id } : s);
  }

  const ordered = draft
    .map((s, i) => ({ s, i, t: Date.parse(s.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i);

  const steps: Step[] = ordered.map(({ s }, index) => {
    const next = ordered[index + 1];
    const durationMs = next ? Math.max(0, next.t - ordered[index].t) : 0;
    return { ...s, index, durationMs };
  });

  const callIds = new Set(steps.filter((s) => s.kind === "tool_call").map((s) => s.tool?.callId ?? ""));
  for (const s of steps) {
    if (s.kind === "tool_result" && s.result && !callIds.has(s.result.callId)) {
      warnings.push(`tool_result ${s.id} has no matching tool_call (${s.result.callId})`);
    }
  }

  if (steps.length === 0) warnings.push("no steps found");

  const startedAt = steps[0]?.at ?? "";
  const endedAt = steps[steps.length - 1]?.at ?? "";
  const totals = steps.reduce(
    (acc, s) => {
      acc.inputTokens += s.tokens?.input ?? 0;
      acc.outputTokens += s.tokens?.output ?? 0;
      if (s.kind === "tool_call") acc.toolCalls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: steps.length ? Date.parse(endedAt) - Date.parse(startedAt) : 0 }
  );

  const model = main.lines.find(
    (l) => l.type === "assistant" && typeof l.message?.model === "string" && !l.message.model.startsWith("<")
  )?.message?.model;
  const id = main.lines.find((l) => typeof l.sessionId === "string")?.sessionId ?? "unknown";

  const trace: Trace = {
    id,
    source: "claude-code",
    title: makeTitle(draft),
    startedAt,
    endedAt,
    ...(model ? { model } : {}),
    totals,
    steps,
  };

  return { trace, warnings };
}

export function parseClaudeCode(text: string): ParseResult {
  return parseClaudeCodeSession([{ name: "main.jsonl", text }]);
}
