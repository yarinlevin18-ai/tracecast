"use client";

import Link from "next/link";
import { DropZone } from "@/components/trace/DropZone";
import { SITE } from "@/lib/site";
import type { SessionFile } from "@/lib/trace/types";

type Props = { onFiles: (files: SessionFile[]) => void; error: string | null };

export function UploadScreen({ onFiles, error }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-24 sm:px-6">
      <nav className="flex h-16 items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-300 hover:text-zinc-100">
          {SITE.name}
        </Link>
        <Link href="/demo" className="text-xs text-zinc-500 hover:text-zinc-200">
          Watch the demo
        </Link>
      </nav>

      <section className="pt-12 sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Drop a session to replay it</h1>
        <p className="mt-3 max-w-[60ch] text-zinc-400">
          Claude Code keeps sessions in <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[13px] text-zinc-300">~/.claude/projects</code>.
          Drop the session file, plus any <code className="font-mono text-[13px] text-zinc-300">agent-*.jsonl</code> files for subagents.
        </p>
        <p className="mt-2 text-sm text-zinc-500">Parsing runs in your browser. Nothing leaves your browser until you click Share.</p>
        <div className="mt-10">
          <DropZone onFiles={onFiles} error={error} />
        </div>
      </section>
    </main>
  );
}
