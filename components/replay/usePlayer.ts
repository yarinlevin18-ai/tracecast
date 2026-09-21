"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import { advance, initialPlayer, seek, seekStep, setSpeed, stepBy, togglePlay, type PlayerState, type Speed } from "@/lib/replay/player";
import { indexAtTime, type Schedule } from "@/lib/replay/schedule";

export type Player = {
  /** Continuous playback time in ms, updated every frame without re-rendering. */
  time: MotionValue<number>;
  index: number;
  playing: boolean;
  ended: boolean;
  speed: Speed;
  totalMs: number;
  count: number;
  toggle: () => void;
  seek: (tMs: number) => void;
  seekStep: (i: number) => void;
  stepBy: (delta: number) => void;
  setSpeed: (s: Speed) => void;
};

/**
 * Runs the pure player against a requestAnimationFrame loop. The clock lives
 * in a ref plus a MotionValue; React state changes only when the current step
 * index, playing flag or speed changes.
 */
export function usePlayer(schedule: Schedule): Player {
  const time = useMotionValue(0);
  const stateRef = useRef<PlayerState>(initialPlayer());
  const [snapshot, setSnapshot] = useState<{ index: number; playing: boolean; ended: boolean; speed: Speed }>({
    index: 0,
    playing: false,
    ended: false,
    speed: 1,
  });

  // Push the ref state out to React and the MotionValue.
  const commit = useCallback(
    (next: PlayerState) => {
      stateRef.current = next;
      time.set(next.timeMs);
      const index = indexAtTime(schedule, next.timeMs);
      setSnapshot((prev) =>
        prev.index === index && prev.playing === next.playing && prev.ended === next.ended && prev.speed === next.speed
          ? prev
          : { index, playing: next.playing, ended: next.ended, speed: next.speed }
      );
    },
    [schedule, time]
  );

  // Reset when the schedule changes (new trace loaded). Calling commit
  // synchronously in the effect body trips react-hooks/set-state-in-effect,
  // so the reset is queued as a microtask instead.
  useEffect(() => {
    stateRef.current = initialPlayer();
    time.set(0);
    queueMicrotask(() => commit(initialPlayer()));
  }, [schedule, commit, time]);

  // Frame loop, active only while playing.
  useEffect(() => {
    if (!snapshot.playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const next = advance(stateRef.current, schedule, dt);
      commit(next);
      if (next.playing) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [snapshot.playing, schedule, commit]);

  const actions = useMemo(
    () => ({
      toggle: () => commit(togglePlay(stateRef.current, schedule)),
      seek: (tMs: number) => commit(seek(stateRef.current, schedule, tMs)),
      seekStep: (i: number) => commit(seekStep(stateRef.current, schedule, i)),
      stepBy: (delta: number) => commit(stepBy(stateRef.current, schedule, delta)),
      setSpeed: (s: Speed) => commit(setSpeed(stateRef.current, s)),
    }),
    [commit, schedule]
  );

  return {
    time,
    index: snapshot.index,
    playing: snapshot.playing,
    ended: snapshot.ended,
    speed: snapshot.speed,
    totalMs: schedule.totalMs,
    count: schedule.startMs.length,
    ...actions,
  };
}
