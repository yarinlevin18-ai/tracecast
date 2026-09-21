import type { Step, Trace } from "./types";

export type TimelineRow = {
  key: string;
  step: Step;
  /** 0 for main session steps, 1 for subagent steps. */
  depth: 0 | 1;
  /** The tool_result folded into a tool_call row, when found. */
  result?: NonNullable<Step["result"]>;
};

export const VIRTUALIZE_ABOVE = 300;

export function shouldVirtualize(rowCount: number): boolean {
  return rowCount > VIRTUALIZE_ABOVE;
}

/** Steps in order, with tool results folded into their calls. */
export function buildTimeline(trace: Trace): TimelineRow[] {
  const resultByCall = new Map<string, NonNullable<Step["result"]>>();
  const callIds = new Set<string>();
  for (const s of trace.steps) {
    if (s.kind === "tool_call" && s.tool) callIds.add(s.tool.callId);
    if (s.kind === "tool_result" && s.result && !resultByCall.has(s.result.callId)) resultByCall.set(s.result.callId, s.result);
  }

  const rows: TimelineRow[] = [];
  for (const s of trace.steps) {
    if (s.kind === "tool_result" && s.result && callIds.has(s.result.callId)) continue;
    const row: TimelineRow = { key: s.id, step: s, depth: s.parentId ? 1 : 0 };
    if (s.kind === "tool_call" && s.tool) {
      const r = resultByCall.get(s.tool.callId);
      if (r) row.result = r;
    }
    rows.push(row);
  }
  return rows;
}
