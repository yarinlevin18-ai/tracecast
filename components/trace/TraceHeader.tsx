import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { Trace } from "@/lib/trace/types";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">{children}</span>
  );
}

export function TraceHeader({ trace, agentCount }: { trace: Trace; agentCount: number }) {
  const started = new Date(trace.startedAt);
  const date = Number.isNaN(started.getTime())
    ? ""
    : started.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <header className="mb-10">
      <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Claude Code session</p>
      <h1 className="text-2xl font-semibold leading-tight text-zinc-50 sm:text-3xl">{trace.title}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {trace.model && <Chip>{trace.model}</Chip>}
        {date && <Chip>{date}</Chip>}
        <Chip>{formatDuration(trace.totals.durationMs)}</Chip>
        <Chip>{formatTokens(trace.totals.inputTokens)} in</Chip>
        <Chip>{formatTokens(trace.totals.outputTokens)} out</Chip>
        <Chip>{trace.totals.toolCalls} tool calls</Chip>
        {agentCount > 1 && <Chip>{agentCount} agents</Chip>}
      </div>
    </header>
  );
}
