"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { shouldVirtualize, type TimelineRow } from "@/lib/trace/timeline";
import { StepRow, type ToolStatus } from "./StepRow";

type Props = { rows: TimelineRow[]; startedAt: string; current?: number; follow?: boolean };

/** Derives the active/enter/status props StepRow needs from replay state. */
function replayProps(row: TimelineRow, current: number | undefined) {
  if (current === undefined) return {};
  const active = row.step.index === current;
  let status: ToolStatus | undefined;
  if (row.step.kind === "tool_call" && row.result) {
    const resolved = row.resultIndex === undefined || row.resultIndex <= current;
    status = !resolved ? "pending" : row.result.isError ? "error" : "done";
  }
  return { active, enter: active, status };
}

/** Keeps the current step in view while the replay follows it. */
function useFollow(current: number | undefined, follow: boolean, scrollTo: (index: number) => void) {
  useEffect(() => {
    if (!follow || current === undefined) return;
    scrollTo(current);
  }, [current, follow, scrollTo]);
}

export function Timeline({ rows, startedAt, current, follow = false }: Props) {
  if (!shouldVirtualize(rows.length)) {
    return <PlainTimeline rows={rows} startedAt={startedAt} current={current} follow={follow} />;
  }
  return <VirtualTimeline rows={rows} startedAt={startedAt} current={current} follow={follow} />;
}

function PlainTimeline({ rows, startedAt, current, follow }: Required<Pick<Props, "follow">> & Props) {
  const scrollTo = useCallback((index: number) => {
    const el = document.querySelector(`[data-step-index="${index}"]`);
    if (!el) return;
    // Scroll only this window. scrollIntoView would also scroll a parent page
    // that embeds the player in an iframe (the landing page demo).
    const margin = parseFloat(getComputedStyle(el).scrollMarginBottom) || 0;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().bottom + margin - window.innerHeight, behavior: "auto" });
  }, []);
  useFollow(current, follow, scrollTo);

  return (
    <div>
      {rows.map((row) => (
        <StepRow key={row.key} row={row} startedAt={startedAt} {...replayProps(row, current)} />
      ))}
    </div>
  );
}

function VirtualTimeline({ rows, startedAt, current, follow }: Required<Pick<Props, "follow">> & Props) {
  const listRef = useRef<HTMLDivElement>(null);
  // The list offset from the top of the page is read after mount (reading a
  // ref during render is not allowed) and refreshed whenever the page above
  // it changes height, for example when the warnings box opens.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.offsetTop);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 64,
    overscan: 12,
    scrollMargin,
    getItemKey: (i) => rows[i].key,
  });
  const items = virtualizer.getVirtualItems();

  const scrollTo = useCallback(
    (index: number) => {
      const rowIndex = rows.findIndex((r) => r.step.index === index);
      if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex, { align: "end" });
    },
    [rows, virtualizer]
  );
  useFollow(current, follow, scrollTo);

  return (
    <div ref={listRef} data-virtualized style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateY(${(items[0]?.start ?? 0) - virtualizer.options.scrollMargin}px)`,
        }}
      >
        {items.map((item) => (
          <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
            <StepRow row={rows[item.index]} startedAt={startedAt} {...replayProps(rows[item.index], current)} />
          </div>
        ))}
      </div>
    </div>
  );
}
