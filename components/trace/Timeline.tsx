"use client";

import { useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { shouldVirtualize, type TimelineRow } from "@/lib/trace/timeline";
import { StepRow } from "./StepRow";

type Props = { rows: TimelineRow[]; startedAt: string };

export function Timeline({ rows, startedAt }: Props) {
  if (!shouldVirtualize(rows.length)) {
    return (
      <div>
        {rows.map((row) => (
          <StepRow key={row.key} row={row} startedAt={startedAt} />
        ))}
      </div>
    );
  }
  return <VirtualTimeline rows={rows} startedAt={startedAt} />;
}

function VirtualTimeline({ rows, startedAt }: Props) {
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
            <StepRow row={rows[item.index]} startedAt={startedAt} />
          </div>
        ))}
      </div>
    </div>
  );
}
