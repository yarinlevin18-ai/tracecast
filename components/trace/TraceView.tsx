"use client";

import { useMemo } from "react";
import { buildTimeline } from "@/lib/trace/timeline";
import type { ParseResult } from "@/lib/trace/types";
import { Timeline } from "./Timeline";
import { TraceHeader } from "./TraceHeader";

type Props = { result: ParseResult; onReset: () => void };

export function TraceView({ result, onReset }: Props) {
  const { trace, warnings } = result;
  const rows = useMemo(() => buildTimeline(trace), [trace]);
  const agentCount = useMemo(() => new Set(trace.steps.map((s) => s.agent)).size, [trace]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
        <button type="button" onClick={onReset} className="text-xs text-zinc-500 hover:text-zinc-200">
          Load another session
        </button>
      </div>
      <TraceHeader trace={trace} agentCount={agentCount} />
      {warnings.length > 0 && (
        <details className="mb-6 rounded-lg border border-amber-900/50 bg-amber-400/5 px-4 py-2 text-xs text-amber-200">
          <summary className="cursor-pointer">
            {warnings.length} parser warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 list-disc pl-5 text-amber-200/80">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <Timeline rows={rows} startedAt={trace.startedAt} />
    </div>
  );
}
