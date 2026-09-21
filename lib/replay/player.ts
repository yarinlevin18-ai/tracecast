import { indexAtTime, type Schedule } from "./schedule";

export type Speed = 1 | 2 | 4;
export const SPEEDS: Speed[] = [1, 2, 4];

export type PlayerState = {
  timeMs: number;
  playing: boolean;
  speed: Speed;
  ended: boolean;
};

export function initialPlayer(): PlayerState {
  return { timeMs: 0, playing: false, speed: 1, ended: false };
}

/** Move the clock forward by a frame. No-op while paused. */
export function advance(p: PlayerState, s: Schedule, dtMs: number): PlayerState {
  if (!p.playing) return p;
  const t = p.timeMs + dtMs * p.speed;
  if (t >= s.totalMs) return { ...p, timeMs: s.totalMs, playing: false, ended: true };
  return { ...p, timeMs: t };
}

export function seek(p: PlayerState, s: Schedule, tMs: number): PlayerState {
  const t = Math.min(s.totalMs, Math.max(0, tMs));
  const ended = t >= s.totalMs;
  return { ...p, timeMs: t, ended, playing: ended ? false : p.playing };
}

/** Jump to the start of a step and pause there. */
export function seekStep(p: PlayerState, s: Schedule, index: number): PlayerState {
  if (s.startMs.length === 0) return { ...p, timeMs: 0, playing: false, ended: false };
  const i = Math.min(s.startMs.length - 1, Math.max(0, index));
  return { ...p, timeMs: s.startMs[i], playing: false, ended: false };
}

/** Previous or next step relative to the one current now. */
export function stepBy(p: PlayerState, s: Schedule, delta: number): PlayerState {
  return seekStep(p, s, indexAtTime(s, p.timeMs) + delta);
}

export function togglePlay(p: PlayerState, s: Schedule): PlayerState {
  if (p.ended || (s.totalMs > 0 && p.timeMs >= s.totalMs)) return { ...p, timeMs: 0, playing: true, ended: false };
  return { ...p, playing: !p.playing };
}

export function setSpeed(p: PlayerState, speed: Speed): PlayerState {
  return { ...p, speed };
}
