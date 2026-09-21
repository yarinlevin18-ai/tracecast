"use client";

import { Code2, Play, Share2 } from "lucide-react";
import { DropZone } from "@/components/trace/DropZone";
import { SITE } from "@/lib/site";
import type { SessionFile } from "@/lib/trace/types";

type Props = { onFiles: (files: SessionFile[]) => void; error: string | null };

const FEATURES = [
  { Icon: Play, title: "Replay", body: "Long pauses are compressed, every step lands in order, and you can scrub, step and speed up." },
  { Icon: Share2, title: "Share", body: "Review what gets published. Secrets and personal paths are redacted before anything is uploaded. Links can expire." },
  { Icon: Code2, title: "Embed", body: "Drop the player into a blog post or a PR with one iframe. Links unfurl with a preview card." },
];

export function Landing({ onFiles, error }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 pb-24">
      <nav className="flex items-center justify-between py-8">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">{SITE.name}</span>
        <a href={SITE.github} className="text-xs text-zinc-500 hover:text-zinc-200" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </nav>

      <section className="py-12 sm:py-20">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">{SITE.tagline}</h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-400">{SITE.description}</p>
        <p className="mt-2 text-sm text-zinc-500">Parsing runs in your browser. Nothing leaves your browser until you click Share.</p>
        <div className="mt-10">
          <DropZone onFiles={onFiles} error={error} />
        </div>
      </section>

      <section className="py-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Watch a real session</h2>
          <a href="/demo" className="text-xs text-zinc-500 hover:text-zinc-200">Open full size</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
          <iframe src="/demo?autoplay=1" title="Tracecast demo replay" className="h-[420px] w-full sm:h-[560px]" loading="lazy" />
        </div>
      </section>

      <section className="grid gap-6 py-12 sm:grid-cols-3">
        {FEATURES.map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <Icon className="h-5 w-5 text-sky-400" aria-hidden />
            <h3 className="mt-3 font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p>
          </div>
        ))}
      </section>

      <footer className="flex items-center justify-between border-t border-zinc-800 pt-8 text-xs text-zinc-500">
        <span>Built by Yarin Levin</span>
        <a href={SITE.github} className="hover:text-zinc-200" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </footer>
    </main>
  );
}
