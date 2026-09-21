"use client";

import Link from "next/link";
import { ReplayView } from "@/components/replay/ReplayView";
import type { Trace } from "@/lib/trace/types";

export function SharedReplay({ trace }: { trace: Trace }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-8">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-200">
          Replay your own session
        </Link>
      </div>
      <ReplayView trace={trace} />
    </>
  );
}
