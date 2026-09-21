import { matchedPatterns, redactText } from "@/lib/trace/secrets";
import type { Step, Trace } from "@/lib/trace/types";

export type RedactionField = "text" | "tool.input" | "result.output" | "agent";

export type RedactionHit = {
  stepId: string;
  index: number;
  fields: RedactionField[];
  /** Names from SECRET_PATTERNS that matched anywhere in the step. */
  patterns: string[];
};

function redactDeep(value: unknown, matched: Set<string>): unknown {
  if (typeof value === "string") {
    for (const name of matchedPatterns(value)) matched.add(name);
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, matched));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__") continue;
      out[k] = redactDeep(v, matched);
    }
    return out;
  }
  return value;
}

function redactStep(step: Step): { step: Step; hit?: RedactionHit } {
  const fields: RedactionField[] = [];
  const patterns = new Set<string>();
  const out: Step = { ...step };

  if (step.text !== undefined) {
    const names = matchedPatterns(step.text);
    if (names.length) {
      fields.push("text");
      names.forEach((n) => patterns.add(n));
      out.text = redactText(step.text);
    }
  }
  {
    const names = matchedPatterns(step.agent);
    if (names.length) {
      fields.push("agent");
      names.forEach((n) => patterns.add(n));
      out.agent = redactText(step.agent);
    }
  }
  if (step.tool) {
    const matched = new Set<string>();
    const input = redactDeep(step.tool.input, matched);
    if (matched.size) {
      fields.push("tool.input");
      matched.forEach((n) => patterns.add(n));
    }
    out.tool = { ...step.tool, input };
  }
  if (step.result) {
    const names = matchedPatterns(step.result.output);
    if (names.length) {
      fields.push("result.output");
      names.forEach((n) => patterns.add(n));
    }
    out.result = { ...step.result, output: names.length ? redactText(step.result.output) : step.result.output };
  }
  return fields.length ? { step: out, hit: { stepId: step.id, index: step.index, fields, patterns: [...patterns] } } : { step: out };
}

/** Applies every secret and path pattern to a Trace, returning a new Trace and the steps that changed. */
export function redactTrace(trace: Trace): { trace: Trace; hits: RedactionHit[] } {
  const hits: RedactionHit[] = [];
  const steps = trace.steps.map((s) => {
    const r = redactStep(s);
    if (r.hit) hits.push(r.hit);
    return r.step;
  });
  return { trace: { ...trace, title: redactText(trace.title), steps }, hits };
}
