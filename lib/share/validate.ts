import type { Step, StepKind, Trace } from "@/lib/trace/types";

export const MAX_TRACE_BYTES = 5 * 1024 * 1024;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const KINDS: StepKind[] = ["user", "assistant", "thinking", "tool_call", "tool_result", "subagent", "system"];

function fail(msg: string): never {
  throw new ValidationError(msg);
}
function str(v: unknown, what: string): string {
  if (typeof v !== "string") fail(`${what} must be a string`);
  return v;
}
function optStr(v: unknown, what: string): string | undefined {
  return v === undefined ? undefined : str(v, what);
}
function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}
function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${what} must be an object`);
  return v as Record<string, unknown>;
}

function step(raw: unknown, i: number): Step {
  const s = obj(raw, `steps[${i}]`);
  const kind = str(s.kind, `steps[${i}].kind`);
  if (!KINDS.includes(kind as StepKind)) fail(`steps[${i}].kind is not a known kind`);
  const out: Step = {
    id: str(s.id, `steps[${i}].id`),
    index: num(s.index, `steps[${i}].index`),
    at: str(s.at, `steps[${i}].at`),
    kind: kind as StepKind,
    agent: str(s.agent, `steps[${i}].agent`),
  };
  if (s.parentId !== undefined) out.parentId = str(s.parentId, `steps[${i}].parentId`);
  if (s.durationMs !== undefined) out.durationMs = num(s.durationMs, `steps[${i}].durationMs`);
  if (s.text !== undefined) out.text = str(s.text, `steps[${i}].text`);
  if (s.tool !== undefined) {
    const t = obj(s.tool, `steps[${i}].tool`);
    out.tool = { name: str(t.name, `steps[${i}].tool.name`), input: t.input, callId: str(t.callId, `steps[${i}].tool.callId`) };
  }
  if (s.result !== undefined) {
    const r = obj(s.result, `steps[${i}].result`);
    out.result = {
      callId: str(r.callId, `steps[${i}].result.callId`),
      output: str(r.output, `steps[${i}].result.output`),
      isError: r.isError === true,
    };
  }
  if (s.tokens !== undefined) {
    const t = obj(s.tokens, `steps[${i}].tokens`);
    out.tokens = { input: num(t.input, `steps[${i}].tokens.input`), output: num(t.output, `steps[${i}].tokens.output`) };
  }
  return out;
}

/** Checks shape and size, returns a clean copy with only known fields. */
export function validateTrace(raw: unknown): Trace {
  const t = obj(raw, "trace");
  const source = str(t.source, "source");
  if (source !== "claude-code" && source !== "otel") fail("source is not supported");
  const totals = obj(t.totals, "totals");
  if (!Array.isArray(t.steps)) fail("steps must be an array");
  const steps = t.steps.map(step);
  const ids = new Set<string>();
  steps.forEach((s, i) => {
    if (ids.has(s.id)) fail(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (s.index !== i) fail(`steps[${i}].index must equal its position`);
  });
  const trace: Trace = {
    id: str(t.id, "id"),
    source,
    title: str(t.title, "title"),
    startedAt: str(t.startedAt, "startedAt"),
    endedAt: str(t.endedAt, "endedAt"),
    totals: {
      inputTokens: num(totals.inputTokens, "totals.inputTokens"),
      outputTokens: num(totals.outputTokens, "totals.outputTokens"),
      toolCalls: num(totals.toolCalls, "totals.toolCalls"),
      durationMs: num(totals.durationMs, "totals.durationMs"),
    },
    steps,
  };
  const model = optStr(t.model, "model");
  if (model !== undefined) trace.model = model;
  const bytes = new TextEncoder().encode(JSON.stringify(trace)).length;
  if (bytes > MAX_TRACE_BYTES) fail(`trace is too large (${bytes} bytes, max ${MAX_TRACE_BYTES})`);
  return trace;
}
