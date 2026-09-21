"use client";

import { useId, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { SessionFile } from "@/lib/trace/types";
import { FIXTURE_NAMES, isDev } from "./useFixtureParam";

type Props = {
  onFiles: (files: SessionFile[]) => void;
  busy?: boolean;
  error?: string | null;
};

async function readAll(list: FileList | File[]): Promise<SessionFile[]> {
  return Promise.all(Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() })));
}

export function DropZone({ onFiles, busy = false, error = null }: Props) {
  const [over, setOver] = useState(false);
  const inputId = useId();

  async function handle(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    onFiles(await readAll(list));
  }

  return (
    <div
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files);
      }}
      className={[
        "rounded-2xl border border-dashed p-12 text-center transition-colors",
        over ? "border-sky-400 bg-sky-400/5" : "border-zinc-700 bg-zinc-900/40",
      ].join(" ")}
    >
      <UploadCloud className="mx-auto mb-4 h-8 w-8 text-zinc-500" aria-hidden />
      <p className="text-base text-zinc-200">Drop a Claude Code session here</p>
      <p className="mt-1 text-sm text-zinc-500">
        The <code className="font-mono">.jsonl</code> file, plus its <code className="font-mono">agent-*.jsonl</code> files if it used subagents.
        Nothing leaves your browser.
      </p>
      <label
        htmlFor={inputId}
        className="mt-6 inline-block cursor-pointer rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
      >
        Choose files
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept=".jsonl"
        className="sr-only"
        onChange={(e) => void handle(e.target.files)}
      />
      {isDev && (
        <p className="mt-6 text-xs text-zinc-500">
          Dev fixtures:{" "}
          {FIXTURE_NAMES.map((name) => (
            <a key={name} href={`?fixture=${name}`} className="mx-1 underline decoration-zinc-700 hover:text-zinc-300">
              {name}
            </a>
          ))}
        </p>
      )}
      {busy && <p className="mt-4 text-sm text-zinc-400">Parsing...</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
