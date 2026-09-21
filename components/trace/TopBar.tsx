"use client";

export type ViewMode = "replay" | "timeline";

type Props = { mode: ViewMode; onMode: (m: ViewMode) => void; onReset: () => void };

export function TopBar({ mode, onMode, onReset }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-8">
      <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex overflow-hidden rounded-md border border-zinc-800 text-xs">
          {(["replay", "timeline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onMode(m)}
              className={`px-3 py-1 capitalize ${mode === m ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" onClick={onReset} className="whitespace-nowrap text-xs text-zinc-500 hover:text-zinc-200">
          Load another session
        </button>
      </div>
    </div>
  );
}
