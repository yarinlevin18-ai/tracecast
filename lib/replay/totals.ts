import type { Step } from "@/lib/trace/types";

export type CumulativeTotals = { input: number[]; output: number[]; toolCalls: number[] };

/** Running totals at each step index, so the replay header can tick up. */
export function cumulativeTotals(steps: Step[]): CumulativeTotals {
  const input: number[] = new Array(steps.length);
  const output: number[] = new Array(steps.length);
  const toolCalls: number[] = new Array(steps.length);
  let i = 0;
  let o = 0;
  let c = 0;
  steps.forEach((s, idx) => {
    i += s.tokens?.input ?? 0;
    o += s.tokens?.output ?? 0;
    if (s.kind === "tool_call") c += 1;
    input[idx] = i;
    output[idx] = o;
    toolCalls[idx] = c;
  });
  return { input, output, toolCalls };
}
