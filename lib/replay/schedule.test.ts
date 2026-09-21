import { describe, expect, it } from "vitest";
import { END_HOLD_MS, MAX_STEP_MS, MIN_STEP_MS, buildSchedule, indexAtTime } from "./schedule";

const gaps = (ms: number[]) => ms.map((durationMs) => ({ durationMs }));

describe("buildSchedule", () => {
  it("returns an empty schedule for no steps", () => {
    expect(buildSchedule([])).toEqual({ startMs: [], durationMs: [], totalMs: 0 });
  });

  it("gives a single step just the end hold", () => {
    expect(buildSchedule(gaps([0]))).toEqual({ startMs: [0], durationMs: [END_HOLD_MS], totalMs: END_HOLD_MS });
  });

  it("caps every step between MIN and MAX and holds on the last one", () => {
    const s = buildSchedule(gaps([1, 100_000, 5_000, 0]));
    expect(s.durationMs[0]).toBe(MIN_STEP_MS);
    expect(s.durationMs[1]).toBe(MAX_STEP_MS);
    expect(s.durationMs[2]).toBeGreaterThanOrEqual(MIN_STEP_MS);
    expect(s.durationMs[2]).toBeLessThanOrEqual(MAX_STEP_MS);
    expect(s.durationMs[3]).toBe(END_HOLD_MS);
    expect(s.startMs).toEqual([0, s.durationMs[0], s.durationMs[0] + s.durationMs[1], s.durationMs[0] + s.durationMs[1] + s.durationMs[2]]);
    expect(s.totalMs).toBe(s.durationMs.reduce((a, b) => a + b, 0));
  });

  it("keeps longer real gaps longer in playback when nothing saturates", () => {
    // 60 gaps cycling 400, 800, 1200 ms sum to 48 s, so the scale is 1.25 and
    // the three sizes land at 500, 1000 and 1500 ms without all hitting the cap.
    const real = Array.from({ length: 61 }, (_, i) => [400, 800, 1200][i % 3]);
    real[60] = 0;
    const s = buildSchedule(gaps(real));
    expect(s.durationMs[0]).toBeGreaterThanOrEqual(MIN_STEP_MS);
    expect(s.durationMs[1]).toBeGreaterThan(s.durationMs[0]);
    expect(s.durationMs[2]).toBeGreaterThan(s.durationMs[1]);
    expect(s.durationMs[2]).toBeLessThanOrEqual(MAX_STEP_MS);
  });

  it("lands a typical 20 minute session near a minute", () => {
    // 150 steps, 8 seconds apart on average, with a few long pauses.
    const real = Array.from({ length: 150 }, (_, i): number => (i % 25 === 0 ? 120_000 : 8_000));
    real[real.length - 1] = 0;
    const s = buildSchedule(gaps(real));
    expect(s.totalMs).toBeGreaterThan(40_000);
    expect(s.totalMs).toBeLessThan(90_000);
  });

  it("treats missing or negative durations as zero", () => {
    const s = buildSchedule([{ durationMs: undefined }, { durationMs: -5 }, { durationMs: 0 }]);
    expect(s.durationMs[0]).toBe(MIN_STEP_MS);
    expect(s.durationMs[1]).toBe(MIN_STEP_MS);
  });
});

describe("indexAtTime", () => {
  const s = buildSchedule(gaps([1_000, 1_000, 1_000, 0]));
  it("finds the step whose window contains t, clamped at both ends", () => {
    expect(indexAtTime(s, -50)).toBe(0);
    expect(indexAtTime(s, 0)).toBe(0);
    expect(indexAtTime(s, s.startMs[1])).toBe(1);
    expect(indexAtTime(s, s.startMs[2] + 1)).toBe(2);
    expect(indexAtTime(s, s.totalMs)).toBe(3);
    expect(indexAtTime(s, s.totalMs + 999)).toBe(3);
  });
  it("returns 0 for an empty schedule", () => {
    expect(indexAtTime(buildSchedule([]), 10)).toBe(0);
  });
});
