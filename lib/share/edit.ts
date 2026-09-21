import type { Step, Trace } from "@/lib/trace/types";

/** Recomputes index, gaps, start and end, and totals after steps change. */
function normalize(trace: Trace, steps: Step[]): Trace {
  const out: Step[] = steps.map((s, index) => ({ ...s, index }));
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].durationMs = next ? Math.max(0, Date.parse(next.at) - Date.parse(out[i].at)) : 0;
  }
  const startedAt = out[0]?.at ?? trace.startedAt;
  const endedAt = out[out.length - 1]?.at ?? trace.endedAt;
  const totals = out.reduce(
    (acc, s) => {
      acc.inputTokens += s.tokens?.input ?? 0;
      acc.outputTokens += s.tokens?.output ?? 0;
      if (s.kind === "tool_call") acc.toolCalls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: out.length ? Date.parse(endedAt) - Date.parse(startedAt) : 0 }
  );
  return { ...trace, startedAt, endedAt, totals, steps: out };
}

export function removeSteps(trace: Trace, ids: Set<string>): Trace {
  if (ids.size === 0) return trace;
  return normalize(trace, trace.steps.filter((s) => !ids.has(s.id)));
}

export type EditableField = "text" | "result.output";

export function editStepText(trace: Trace, id: string, field: EditableField, value: string): Trace {
  const i = trace.steps.findIndex((s) => s.id === id);
  if (i < 0) return trace;
  const s = trace.steps[i];
  const edited: Step =
    field === "text" ? { ...s, text: value } : s.result ? { ...s, result: { ...s.result, output: value } } : s;
  if (edited === s) return trace;
  const steps = trace.steps.slice();
  steps[i] = edited;
  return { ...trace, steps };
}
