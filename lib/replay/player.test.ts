import { describe, expect, it } from "vitest";
import { buildSchedule } from "./schedule";
import { advance, initialPlayer, seek, seekStep, setSpeed, stepBy, togglePlay } from "./player";

// Four steps: starts at 0, 1500, 3000, 4500; total 5700 (1200 end hold).
const s = buildSchedule([{ durationMs: 60_000 }, { durationMs: 60_000 }, { durationMs: 60_000 }, { durationMs: 0 }]);

describe("player", () => {
  it("starts paused at zero", () => {
    expect(initialPlayer()).toEqual({ timeMs: 0, playing: false, speed: 1, ended: false });
  });

  it("advances by dt times speed only while playing", () => {
    const paused = advance(initialPlayer(), s, 500);
    expect(paused.timeMs).toBe(0);
    const p = togglePlay(initialPlayer(), s);
    expect(advance(p, s, 500).timeMs).toBe(500);
    expect(advance(setSpeed(p, 4), s, 500).timeMs).toBe(2000);
    expect(advance(p, s, -500).timeMs).toBe(0);
  });

  it("stops at the end and marks ended", () => {
    const p = advance(togglePlay(initialPlayer(), s), s, 99_999);
    expect(p).toEqual({ timeMs: s.totalMs, playing: false, speed: 1, ended: true });
  });

  it("toggling after the end restarts from zero", () => {
    const ended = advance(togglePlay(initialPlayer(), s), s, 99_999);
    expect(togglePlay(ended, s)).toEqual({ timeMs: 0, playing: true, speed: 1, ended: false });
  });

  it("seek clamps and clears ended when moving back", () => {
    const ended = advance(togglePlay(initialPlayer(), s), s, 99_999);
    expect(seek(ended, s, -10)).toEqual({ timeMs: 0, playing: false, speed: 1, ended: false });
    expect(seek(initialPlayer(), s, 99_999).timeMs).toBe(s.totalMs);
    expect(seek(initialPlayer(), s, 99_999).ended).toBe(true);
  });

  it("seekStep and stepBy land on step starts", () => {
    expect(seekStep(initialPlayer(), s, 2).timeMs).toBe(s.startMs[2]);
    expect(seekStep(initialPlayer(), s, 99).timeMs).toBe(s.startMs[3]);
    const at2 = seekStep(initialPlayer(), s, 2);
    expect(stepBy(at2, s, 1).timeMs).toBe(s.startMs[3]);
    expect(stepBy(at2, s, -1).timeMs).toBe(s.startMs[1]);
    expect(stepBy(seek(initialPlayer(), s, s.startMs[2] + 700), s, -1).timeMs).toBe(s.startMs[1]);
  });

  it("stepBy pauses playback", () => {
    const p = togglePlay(initialPlayer(), s);
    expect(stepBy(p, s, 1).playing).toBe(false);
  });

  it("setSpeed accepts only 1, 2 and 4", () => {
    expect(setSpeed(initialPlayer(), 2).speed).toBe(2);
    expect(setSpeed(initialPlayer(), 4).speed).toBe(4);
  });
});
