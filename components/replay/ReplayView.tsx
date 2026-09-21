"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildSchedule } from "@/lib/replay/schedule";
import { cumulativeTotals } from "@/lib/replay/totals";
import { buildTimeline } from "@/lib/trace/timeline";
import type { Trace } from "@/lib/trace/types";
import { Timeline } from "@/components/trace/Timeline";
import { LiveTotals } from "./LiveTotals";
import { PlayerBar } from "./PlayerBar";
import { usePlayer } from "./usePlayer";
import { useReplayKeys } from "./useReplayKeys";

type Props = { trace: Trace; warnings: string[]; compact?: boolean; autoplay?: boolean };

/** Number of rows whose step index is at most `index` (rows are in step order). */
function visibleCount(rows: { step: { index: number } }[], index: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].step.index <= index) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function ReplayView({ trace, compact = false, autoplay = false }: Props) {
  const schedule = useMemo(() => buildSchedule(trace.steps), [trace]);
  const totals = useMemo(() => cumulativeTotals(trace.steps), [trace]);
  const rows = useMemo(() => buildTimeline(trace), [trace]);
  const player = usePlayer(schedule);
  useReplayKeys(player);

  // Autoplay once per schedule, after the player's own reset microtask has run.
  const { toggle } = player;
  const started = useRef(false);
  useEffect(() => {
    started.current = false;
    if (!autoplay) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || started.current) return;
      started.current = true;
      toggle();
    });
    return () => {
      cancelled = true;
    };
  }, [autoplay, schedule, toggle]);

  const visible = useMemo(() => rows.slice(0, visibleCount(rows, player.index)), [rows, player.index]);

  return (
    <div className={`mx-auto w-full max-w-3xl px-6 ${compact ? "pt-2 pb-24" : "pt-4 pb-32"}`}>
      <LiveTotals trace={trace} index={player.index} totals={totals} compact={compact} />
      <Timeline rows={visible} startedAt={trace.startedAt} current={player.index} follow={player.playing} />
      <PlayerBar player={player} />
    </div>
  );
}
