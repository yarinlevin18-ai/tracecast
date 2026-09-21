"use client";

import { useRef } from "react";
import { motion, useMotionValueEvent, useTransform } from "motion/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { SPEEDS } from "@/lib/replay/player";
import type { Player } from "./usePlayer";

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerBar({ player }: { player: Player }) {
  const scrubRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const elapsed = useTransform(player.time, (t) => clock(t));
  const fill = useTransform(player.time, (t) => `${player.totalMs > 0 ? (t / player.totalMs) * 100 : 0}%`);

  // Drive the native slider from the MotionValue without re-rendering.
  useMotionValueEvent(player.time, "change", (t) => {
    if (scrubRef.current && !dragging.current) scrubRef.current.value = String(Math.round(t));
  });

  const mainLabel = player.ended ? "Replay" : player.playing ? "Pause" : "Play";
  const MainIcon = player.ended ? RotateCcw : player.playing ? Pause : Play;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 py-3">
        <div className="relative h-6">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-800">
            <motion.div className="h-full rounded-full bg-sky-400" style={{ width: fill }} />
          </div>
          <input
            ref={scrubRef}
            type="range"
            aria-label="Seek"
            min={0}
            max={player.totalMs}
            step={1}
            defaultValue={0}
            onPointerDown={() => {
              dragging.current = true;
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onBlur={() => {
              dragging.current = false;
            }}
            onChange={(e) => player.seek(Number(e.target.value))}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <button type="button" aria-label="Previous step" onClick={() => player.stepBy(-1)} className="rounded p-1 hover:text-zinc-100">
            <SkipBack className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={mainLabel}
            onClick={player.toggle}
            className="rounded-full bg-zinc-100 p-2 text-zinc-900 hover:bg-white"
          >
            <MainIcon className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next step" onClick={() => player.stepBy(1)} className="rounded p-1 hover:text-zinc-100">
            <SkipForward className="h-4 w-4" aria-hidden />
          </button>

          <span className="ml-2 font-mono tabular-nums">
            <motion.span>{elapsed}</motion.span> <span className="text-zinc-600">/</span> <span>{clock(player.totalMs)}</span>
          </span>

          <span className="ml-auto font-mono tabular-nums text-zinc-500">
            {player.count === 0 ? "0 / 0" : `${player.index + 1} / ${player.count}`}
          </span>

          <div className="flex overflow-hidden rounded-md border border-zinc-800">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`${s}x`}
                aria-pressed={player.speed === s}
                onClick={() => player.setSpeed(s)}
                className={`px-2 py-1 font-mono ${player.speed === s ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
