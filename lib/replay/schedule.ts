/**
 * Maps trace steps onto a compressed playback clock.
 *
 * Real gaps are capped (a 40 minute pause and a 30 second pause both count as
 * 30 seconds), the capped total is scaled toward TARGET_MS, and every step is
 * then clamped between MIN_STEP_MS and MAX_STEP_MS so nothing flashes by or
 * drags. Long sessions therefore run longer than a minute; that is intended.
 */
export type Schedule = {
  /** Playback time at which step i becomes current. */
  startMs: number[];
  /** How long step i stays current before the next one. */
  durationMs: number[];
  totalMs: number;
};

export const REAL_GAP_CAP_MS = 30_000;
export const TARGET_MS = 60_000;
export const MIN_STEP_MS = 120;
export const MAX_STEP_MS = 1_500;
/** The last step lingers so the replay does not cut off as it lands. */
export const END_HOLD_MS = 1_200;

type HasDuration = { durationMs?: number };

export function buildSchedule(steps: HasDuration[]): Schedule {
  const n = steps.length;
  if (n === 0) return { startMs: [], durationMs: [], totalMs: 0 };

  const capped = steps.map((s, i) => (i === n - 1 ? 0 : Math.min(Math.max(s.durationMs ?? 0, 0), REAL_GAP_CAP_MS)));
  const realTotal = capped.reduce((a, b) => a + b, 0);
  const scale = realTotal > 0 ? TARGET_MS / realTotal : 1;

  const durationMs = capped.map((g, i) => (i === n - 1 ? END_HOLD_MS : clamp(g * scale, MIN_STEP_MS, MAX_STEP_MS)));
  const startMs: number[] = new Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    startMs[i] = t;
    t += durationMs[i];
  }
  return { startMs, durationMs, totalMs: t };
}

/** Index of the step current at playback time t (binary search). */
export function indexAtTime(schedule: Schedule, t: number): number {
  const { startMs } = schedule;
  if (startMs.length === 0) return 0;
  let lo = 0;
  let hi = startMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (startMs[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
