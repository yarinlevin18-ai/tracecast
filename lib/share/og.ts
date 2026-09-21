import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { Step, StepKind, Trace } from "@/lib/trace/types";

/** Hex colours per step kind, matching the Tailwind classes in StepIcon. */
export const KIND_COLORS: Record<StepKind, string> = {
  user: "#38bdf8",
  assistant: "#34d399",
  thinking: "#a78bfa",
  tool_call: "#fbbf24",
  tool_result: "#fbbf24",
  subagent: "#f472b6",
  system: "#52525b",
};

/** Cuts a title to max chars on a word boundary and appends "..." when cut. */
export function clampTitle(title: string, max: number): string {
  const t = title.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, Math.max(0, max - 3));
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "...";
}

/** "1 tool call" / "N tool calls". */
export function toolCallsLabel(n: number): string {
  return `${n} tool call${n === 1 ? "" : "s"}`;
}

/** One line for og:description and the image subtitle. */
export function describeTrace(trace: Trace): string {
  const n = trace.steps.length;
  const parts = [
    `${n} step${n === 1 ? "" : "s"}`,
    `${formatTokens(trace.totals.inputTokens)} tokens in`,
    `${formatTokens(trace.totals.outputTokens)} out`,
    toolCallsLabel(trace.totals.toolCalls),
    formatDuration(trace.totals.durationMs),
  ];
  const line = parts.join(", ");
  return trace.model ? `${line} with ${trace.model}` : line;
}

/** Short footer line for the OG image: step count and recording date. */
export function footerLine(trace: Trace): string {
  const n = trace.steps.length;
  const date = new Date(trace.startedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return `${n} step${n === 1 ? "" : "s"}, recorded ${date}`;
}

/**
 * Splits the step list into n equal cells and picks the most common kind in
 * each, so a long session compresses into a coloured strip. Ties go to the
 * kind seen first. Empty input yields "system" cells.
 */
export function kindStrip(steps: Pick<Step, "kind">[], n: number): StepKind[] {
  const out: StepKind[] = [];
  if (steps.length === 0) return new Array(n).fill("system");
  for (let c = 0; c < n; c++) {
    const from = Math.floor((c * steps.length) / n);
    const to = Math.max(from + 1, Math.floor(((c + 1) * steps.length) / n));
    const counts = new Map<StepKind, number>();
    for (let i = from; i < to && i < steps.length; i++) counts.set(steps[i].kind, (counts.get(steps[i].kind) ?? 0) + 1);
    let best: StepKind = steps[from].kind;
    let bestN = 0;
    for (const [k, v] of counts) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    out.push(best);
  }
  return out;
}
