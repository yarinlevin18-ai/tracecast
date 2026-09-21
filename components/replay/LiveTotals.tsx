"use client";

import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { CumulativeTotals } from "@/lib/replay/totals";
import type { Trace } from "@/lib/trace/types";
import { TickingNumber } from "./TickingNumber";

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">{children}</span>;
}

export function LiveTotals({
  trace,
  index,
  totals,
  compact = false,
}: {
  trace: Trace;
  index: number;
  totals: CumulativeTotals;
  compact?: boolean;
}) {
  const step = trace.steps[index];
  const elapsed = step ? Math.max(0, Date.parse(step.at) - Date.parse(trace.startedAt)) : 0;
  const at = (arr: number[]) => arr[index] ?? 0;
  return (
    <header className="sticky top-0 z-10 -mx-6 mb-6 border-b border-zinc-800/80 bg-zinc-950/85 px-6 py-4 backdrop-blur">
      <h1 className={`truncate font-semibold text-zinc-50 ${compact ? "text-base" : "text-lg"}`}>{trace.title}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        {trace.model && !compact && <Chip>{trace.model}</Chip>}
        <Chip>{formatDuration(elapsed)}</Chip>
        <Chip>
          <TickingNumber value={at(totals.input)} format={formatTokens} /> in
        </Chip>
        <Chip>
          <TickingNumber value={at(totals.output)} format={formatTokens} /> out
        </Chip>
        <Chip>
          <TickingNumber value={at(totals.toolCalls)} format={String} /> tool calls
        </Chip>
      </div>
    </header>
  );
}
