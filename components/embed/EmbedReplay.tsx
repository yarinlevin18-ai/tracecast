"use client";

import { ReplayView } from "@/components/replay/ReplayView";
import type { Trace } from "@/lib/trace/types";

export function EmbedReplay({ trace, shareUrl, autoplay }: { trace: Trace; shareUrl: string; autoplay: boolean }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-4">
        <span className="text-xs font-semibold tracking-tight text-zinc-400">Tracecast</span>
        <a href={shareUrl} target="_blank" rel="noopener" className="text-xs text-zinc-500 hover:text-zinc-200">
          Open replay
        </a>
      </div>
      <ReplayView trace={trace} warnings={[]} compact autoplay={autoplay} />
    </>
  );
}
