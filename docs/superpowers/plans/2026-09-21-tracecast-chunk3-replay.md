# Tracecast Chunk 3: Animated Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A replay mode on `/` that plays the parsed Trace back in compressed time: steps appear in sequence, tool calls visibly fire and resolve, the token counter ticks up, with play/pause, a scrub bar, 1x/2x/4x speed and keyboard step navigation. Smooth at 60fps on the long fixture; scrubbing jumps instantly.

**Architecture:** Three pure modules in `lib/replay/` own all timing math: `schedule.ts` maps each step to a playback start time (real gaps capped, then scaled so a typical session lands near 60 seconds), `player.ts` is a pure state machine (advance, seek, step, speed), `totals.ts` precomputes cumulative tokens per step. React only wires them: `usePlayer` runs a requestAnimationFrame loop that writes the continuous playback time into a Framer Motion `MotionValue` (no React re-render per frame) and updates React state only when the current step index changes. The existing `Timeline` and `StepRow` gain optional replay props (`current`, `status`, `enter`) and stay unchanged in the static timeline. Animations use `motion/react` directly, isolated in a few clearly marked places so motion-lab patterns can replace them later without touching the timing logic.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, `motion` (Framer Motion v12, import from `motion/react`), `@tanstack/react-virtual`, `lucide-react`, Vitest 5 (node for `lib/`, jsdom for components).

**Repo facts:** `/Users/yarin/Projects/tracecast`, npm, commits straight to `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Chunks 1 and 2 delivered the parser (`lib/trace/`), the static timeline (`components/trace/`), fixtures under `fixtures/`, the dev-only `?fixture=<name>` loader, and `app/page.tsx` which renders `DropZone` until a trace is parsed, then `TraceView`. Style rule: no em dashes in code, comments or copy. Run `npm test`, `npx tsc --noEmit`, `npm run lint` plainly. `npm install` and `npm run build` need the sandbox disabled. The vitest config has `globals: true` and `esbuild.jsx: "automatic"`; component tests start with `// @vitest-environment jsdom`.

**Motion-lab note:** Yarin's motion-lab spec is not on this Mac yet. Every Framer Motion usage in this chunk is confined to: `components/replay/motion.ts` (shared transition presets), the `enter` animation in `StepRow`, the pulsing dot in `ToolStatus`, and `TickingNumber`. Swapping in motion-lab later means editing those four places only.

**Design language (continues chunk 2):** page `bg-zinc-950`, surfaces `bg-zinc-900/60 border-zinc-800`, accents per kind (user sky-400, assistant emerald-400, thinking violet-400, tool amber-400, subagent pink-400). Replay additions: the current step's icon gets a soft ring in its accent color; a pending tool shows a pulsing amber dot and the word "running"; a resolved tool shows a small emerald check, a failed one a red x. The player bar is fixed to the bottom, `bg-zinc-950/85 backdrop-blur border-t border-zinc-800`, scrub track `bg-zinc-800`, fill `bg-sky-400`.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/replay/schedule.ts` | `buildSchedule(steps)` -> `Schedule`, `indexAtTime(schedule, t)` (pure) |
| `lib/replay/totals.ts` | `cumulativeTotals(steps)` -> per-step running token and tool counts (pure) |
| `lib/replay/player.ts` | `PlayerState` and pure transitions: `advance`, `seek`, `seekStep`, `togglePlay`, `setSpeed`, `stepBy` |
| `lib/trace/timeline.ts` | add `resultIndex` to `TimelineRow` |
| `components/replay/motion.ts` | shared Framer Motion transition presets (the swap point for motion-lab) |
| `components/replay/usePlayer.ts` | rAF loop, `time` MotionValue, React state for index/playing/speed, actions |
| `components/replay/PlayerBar.tsx` | play/pause, scrub, time, speed, step counter |
| `components/replay/useReplayKeys.ts` | keyboard bindings (space, arrows, home, end, 1/2/4) |
| `components/replay/TickingNumber.tsx` | animated number that eases to its new value |
| `components/replay/LiveTotals.tsx` | title plus ticking chips (elapsed, tokens, tool calls, step) |
| `components/replay/ReplayView.tsx` | composes schedule, player, visible rows, timeline, bar |
| `components/trace/TopBar.tsx` | Tracecast label, Replay/Timeline switch, Load another session |
| `components/trace/StepRow.tsx` | optional `enter`, `active`, `status` props; `ToolStatus` marker |
| `components/trace/Timeline.tsx` | optional `current` and `follow` props, auto-scroll to current |
| `components/trace/TraceView.tsx` | uses `TopBar` |
| `app/page.tsx` | mode state: replay (default) or timeline |

---

### Task 1: Install motion, schedule, totals, resultIndex

**Files:**
- Modify: `package.json` (via npm)
- Create: `lib/replay/schedule.ts`, `lib/replay/schedule.test.ts`
- Create: `lib/replay/totals.ts`, `lib/replay/totals.test.ts`
- Modify: `lib/trace/timeline.ts`, `lib/trace/timeline.test.ts`

- [ ] **Step 1: Install (sandbox disabled)**

```bash
cd /Users/yarin/Projects/tracecast && npm install motion
```

Expected: `motion` ^12 in dependencies. Import path in code is `motion/react`.

- [ ] **Step 2: Schedule tests (failing)**

`lib/replay/schedule.test.ts`:

```ts
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

  it("keeps longer real gaps at least as long in playback", () => {
    const s = buildSchedule(gaps([2_000, 8_000, 4_000, 0]));
    expect(s.durationMs[1]).toBeGreaterThanOrEqual(s.durationMs[2]);
    expect(s.durationMs[2]).toBeGreaterThanOrEqual(s.durationMs[0]);
  });

  it("lands a typical 20 minute session near a minute", () => {
    // 150 steps, 8 seconds apart on average, with a few long pauses.
    const real = Array.from({ length: 150 }, (_, i) => (i % 25 === 0 ? 120_000 : 8_000));
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
```

- [ ] **Step 3: Schedule implementation**

`lib/replay/schedule.ts`:

```ts
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
```

- [ ] **Step 4: Totals tests (failing)**

`lib/replay/totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cumulativeTotals } from "./totals";
import type { Step } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });

describe("cumulativeTotals", () => {
  it("accumulates tokens and tool calls per step index", () => {
    const t = cumulativeTotals([
      step({ id: "a", kind: "user" }),
      step({ id: "b", kind: "assistant", tokens: { input: 100, output: 10 } }),
      step({ id: "c", kind: "tool_call", tool: { name: "Read", input: {}, callId: "x" } }),
      step({ id: "d", kind: "assistant", tokens: { input: 50, output: 5 } }),
    ]);
    expect(t.input).toEqual([0, 100, 100, 150]);
    expect(t.output).toEqual([0, 10, 10, 15]);
    expect(t.toolCalls).toEqual([0, 0, 1, 1]);
  });

  it("handles no steps", () => {
    expect(cumulativeTotals([])).toEqual({ input: [], output: [], toolCalls: [] });
  });
});
```

- [ ] **Step 5: Totals implementation**

`lib/replay/totals.ts`:

```ts
import type { Step } from "@/lib/trace/types";

export type CumulativeTotals = { input: number[]; output: number[]; toolCalls: number[] };

/** Running totals at each step index, so the replay header can tick up. */
export function cumulativeTotals(steps: Step[]): CumulativeTotals {
  const input: number[] = new Array(steps.length);
  const output: number[] = new Array(steps.length);
  const toolCalls: number[] = new Array(steps.length);
  let i = 0;
  let o = 0;
  let c = 0;
  steps.forEach((s, idx) => {
    i += s.tokens?.input ?? 0;
    o += s.tokens?.output ?? 0;
    if (s.kind === "tool_call") c += 1;
    input[idx] = i;
    output[idx] = o;
    toolCalls[idx] = c;
  });
  return { input, output, toolCalls };
}
```

- [ ] **Step 6: resultIndex on TimelineRow**

Add to `lib/trace/timeline.test.ts` inside `describe("buildTimeline")`:

```ts
  it("records the step index of the folded result", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "c1", kind: "tool_call", tool: { name: "Read", input: {}, callId: "call-1" } }),
        step({ id: "u", kind: "user", text: "meanwhile" }),
        step({ id: "r1", kind: "tool_result", result: { callId: "call-1", output: "ok", isError: false } }),
      ])
    );
    expect(rows[0].resultIndex).toBe(2);
    expect(rows[1].resultIndex).toBeUndefined();
  });
```

Change `lib/trace/timeline.ts`: `TimelineRow` gains `/** Index of the step that carried the folded result. */ resultIndex?: number;`. In `buildTimeline`, store `{ result, index }` in the map:

```ts
  const resultByCall = new Map<string, { result: NonNullable<Step["result"]>; index: number }>();
  ...
    if (s.kind === "tool_result" && s.result && !resultByCall.has(s.result.callId)) resultByCall.set(s.result.callId, { result: s.result, index: s.index });
  ...
    if (s.kind === "tool_call" && s.tool) {
      const r = resultByCall.get(s.tool.callId);
      if (r) {
        row.result = r.result;
        row.resultIndex = r.index;
      }
    }
```

- [ ] **Step 7: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add package.json package-lock.json lib/replay lib/trace/timeline.ts lib/trace/timeline.test.ts
git commit -m "feat(replay): playback schedule, cumulative totals and result indexes"
```

---

### Task 2: Pure player state machine

**Files:**
- Create: `lib/replay/player.ts`, `lib/replay/player.test.ts`

- [ ] **Step 1: Tests (failing)**

```ts
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
```

- [ ] **Step 2: Implementation**

`lib/replay/player.ts`:

```ts
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
```

- [ ] **Step 3: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add lib/replay/player.ts lib/replay/player.test.ts
git commit -m "feat(replay): pure player state machine"
```

---

### Task 3: usePlayer hook, motion presets and PlayerBar

**Files:**
- Create: `components/replay/motion.ts`
- Create: `components/replay/usePlayer.ts`
- Create: `components/replay/PlayerBar.tsx`, `components/replay/PlayerBar.test.tsx`

- [ ] **Step 1: Motion presets**

`components/replay/motion.ts`:

```ts
import type { Transition } from "motion/react";

/**
 * The only place that defines how replay elements move. Swap these for
 * motion-lab presets when the spec lands; components import from here.
 */
export const enterTransition: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };
export const enterInitial = { opacity: 0, y: 10 };
export const enterAnimate = { opacity: 1, y: 0 };

export const pulseTransition: Transition = { duration: 1.1, repeat: Infinity, ease: "easeInOut" };
export const pulseAnimate = { opacity: [1, 0.35, 1], scale: [1, 0.8, 1] };

/** Seconds for a ticking number to ease to its new value. */
export const tickSeconds = 0.35;
```

- [ ] **Step 2: usePlayer**

`components/replay/usePlayer.ts`:

```ts
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

  // Reset when the schedule changes (new trace loaded).
  useEffect(() => {
    commit(initialPlayer());
  }, [schedule, commit]);

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
```

- [ ] **Step 3: PlayerBar test (failing)**

`components/replay/PlayerBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { motionValue } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBar } from "./PlayerBar";
import type { Player } from "./usePlayer";

function player(over: Partial<Player> = {}): Player {
  return {
    time: motionValue(0),
    index: 3,
    playing: false,
    ended: false,
    speed: 1,
    totalMs: 60_000,
    count: 10,
    toggle: vi.fn(),
    seek: vi.fn(),
    seekStep: vi.fn(),
    stepBy: vi.fn(),
    setSpeed: vi.fn(),
    ...over,
  };
}

describe("PlayerBar", () => {
  it("shows play when paused, pause when playing, replay when ended", () => {
    const { rerender } = render(<PlayerBar player={player()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    rerender(<PlayerBar player={player({ playing: true })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    rerender(<PlayerBar player={player({ ended: true })} />);
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("wires toggle, step buttons, speed and the scrub bar", () => {
    const p = player();
    render(<PlayerBar player={p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(p.toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(p.stepBy).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(p.stepBy).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    expect(p.setSpeed).toHaveBeenCalledWith(2);
    const scrub = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
    expect(scrub.max).toBe("60000");
    fireEvent.change(scrub, { target: { value: "12000" } });
    expect(p.seek).toHaveBeenCalledWith(12000);
  });

  it("shows the step counter and total time", () => {
    render(<PlayerBar player={player()} />);
    expect(screen.getByText("4 / 10")).toBeTruthy();
    expect(screen.getByText("1:00")).toBeTruthy();
  });
});
```

- [ ] **Step 4: PlayerBar**

`components/replay/PlayerBar.tsx`:

```tsx
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
```

The `<motion.span>{elapsed}</motion.span>` pattern renders a MotionValue as text and updates it outside React.

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/replay/motion.ts components/replay/usePlayer.ts components/replay/PlayerBar.tsx components/replay/PlayerBar.test.tsx
git commit -m "feat(replay): usePlayer frame loop and PlayerBar"
```

If `motionValue` cannot be imported from `motion/react` in the test, import it from `motion` instead and note it.

---

### Task 4: Replay affordances in StepRow and Timeline

**Files:**
- Modify: `components/trace/StepRow.tsx`, `components/trace/StepRow.test.tsx`
- Modify: `components/trace/Timeline.tsx`, `components/trace/Timeline.test.tsx`

- [ ] **Step 1: StepRow tests (add to the existing describe)**

```tsx
  it("shows a running marker for a pending tool and a check when done", () => {
    const r = row(
      { id: "c", kind: "tool_call", tool: { name: "Read", input: { file_path: "a.ts" }, callId: "x" } },
      { result: { callId: "x", output: "ok", isError: false }, resultIndex: 5 }
    );
    const { rerender } = render(<StepRow row={r} startedAt={T0} status="pending" />);
    expect(screen.getByText("running")).toBeTruthy();
    rerender(<StepRow row={r} startedAt={T0} status="done" />);
    expect(screen.queryByText("running")).toBeNull();
    expect(screen.getByLabelText("Completed")).toBeTruthy();
  });

  it("marks the active step", () => {
    render(<StepRow row={row({ id: "u", kind: "user", text: "hi" })} startedAt={T0} active />);
    expect(screen.getByRole("article").getAttribute("data-active")).toBe("true");
  });
```

- [ ] **Step 2: StepRow changes**

At the top of `components/trace/StepRow.tsx` add imports:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import { enterAnimate, enterInitial, enterTransition, pulseAnimate, pulseTransition } from "@/components/replay/motion";
```

Change the props type and the outer element:

```tsx
export type ToolStatus = "pending" | "done" | "error";

type Props = {
  row: TimelineRow;
  startedAt: string;
  /** Replay: this row is the current step. */
  active?: boolean;
  /** Replay: animate the row in on mount. */
  enter?: boolean;
  /** Replay: tool call state; undefined in the static timeline. */
  status?: ToolStatus;
};

export function StepRow({ row, startedAt, active = false, enter = false, status }: Props) {
  const { step, depth } = row;
  const reduced = useReducedMotion();
  const offset = formatOffset(Math.max(0, Date.parse(step.at) - Date.parse(startedAt)));
  const animateIn = enter && !reduced;

  return (
    <motion.article
      initial={animateIn ? enterInitial : false}
      animate={animateIn ? enterAnimate : undefined}
      transition={enterTransition}
      className={`relative flex gap-4 py-3 ${depth === 1 ? "pl-10" : ""}`}
      data-kind={step.kind}
      data-depth={depth}
      data-active={active || undefined}
      data-step-index={step.index}
    >
      <div className="relative flex w-6 shrink-0 justify-center">
        <span className="absolute top-0 bottom-0 w-px bg-zinc-800" aria-hidden />
        <span className={`relative mt-1 rounded-full bg-zinc-950 p-1 ${active ? "ring-2 ring-zinc-500/60" : ""}`}>
          <StepIcon kind={step.kind} />
        </span>
      </div>
      ...unchanged body, but pass status down: <Body row={row} status={status} />
```

`data-active={active || undefined}` renders `data-active="true"` only when active. `Body` forwards `status` to `ToolBody`. In `ToolBody`, after the summary span and before the "failed" badge, render `<ToolStatusMark status={status} />`, and only show the existing "failed" badge when `status` is undefined (static mode) or `"error"`:

```tsx
function ToolStatusMark({ status }: { status?: ToolStatus }) {
  if (status === "pending") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
        <motion.span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" animate={pulseAnimate} transition={pulseTransition} aria-hidden />
        running
      </span>
    );
  }
  if (status === "done") return <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="Completed" role="img" />;
  if (status === "error") return <X className="h-3.5 w-3.5 text-red-400" aria-label="Failed" role="img" />;
  return null;
}
```

Keep the existing `{result?.isError && <span ...>failed</span>}` badge but guard it with `status !== "pending"` so a not-yet-resolved call does not leak its outcome.

- [ ] **Step 3: Timeline tests (add)**

```tsx
  it("passes replay state to rows", () => {
    const list = rows(3);
    list[1] = { ...list[1], step: { ...list[1].step, kind: "tool_call", tool: { name: "Read", input: {}, callId: "c" } }, result: { callId: "c", output: "", isError: false }, resultIndex: 2 };
    const { container } = render(<Timeline rows={list} startedAt={T} current={1} />);
    const articles = container.querySelectorAll("article");
    expect(articles[1].getAttribute("data-active")).toBe("true");
    expect(articles[0].getAttribute("data-active")).toBeNull();
    expect(container.textContent).toContain("running");
  });
```

- [ ] **Step 4: Timeline changes**

Props: `{ rows: TimelineRow[]; startedAt: string; current?: number; follow?: boolean }`. Add a helper and use it in both list variants:

```tsx
function replayProps(row: TimelineRow, current: number | undefined) {
  if (current === undefined) return {};
  const active = row.step.index === current;
  let status: ToolStatus | undefined;
  if (row.step.kind === "tool_call" && row.result) {
    const resolved = row.resultIndex === undefined || row.resultIndex <= current;
    status = !resolved ? "pending" : row.result.isError ? "error" : "done";
  }
  return { active, enter: active, status };
}
```

Plain list: `<StepRow key={row.key} row={row} startedAt={startedAt} {...replayProps(row, current)} />`. Same inside the virtualized item. Import `ToolStatus` type from `./StepRow`.

Auto-follow. In `Timeline` (plain branch) add a small effect component, and in `VirtualTimeline` use the virtualizer:

```tsx
function useFollow(current: number | undefined, follow: boolean, scrollTo: (index: number) => void) {
  useEffect(() => {
    if (!follow || current === undefined) return;
    scrollTo(current);
  }, [current, follow, scrollTo]);
}
```

Plain list: `scrollTo = useCallback((i) => { document.querySelector(`[data-step-index="${i}"]`)?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [])` inside a `PlainTimeline` component (split the plain branch into its own component so hooks are unconditional). Virtual list: `scrollTo = useCallback((i) => { const rowIndex = rows.findIndex((r) => r.step.index === i); if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex, { align: "end" }); }, [rows, virtualizer])`. Note `scrollToIndex` takes the row index, not the step index. Wrap in `if (typeof window !== "undefined")` only if jsdom throws on `scrollIntoView` (jsdom does not implement it: guard with `el && typeof el.scrollIntoView === "function"`).

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/trace/StepRow.tsx components/trace/StepRow.test.tsx components/trace/Timeline.tsx components/trace/Timeline.test.tsx
git commit -m "feat(replay): row enter animation, tool status marks and follow-current in Timeline"
```

---

### Task 5: TickingNumber, LiveTotals, ReplayView, keys, TopBar, mode switch

**Files:**
- Create: `components/replay/TickingNumber.tsx`
- Create: `components/replay/LiveTotals.tsx`, `components/replay/LiveTotals.test.tsx`
- Create: `components/replay/useReplayKeys.ts`
- Create: `components/replay/ReplayView.tsx`, `components/replay/ReplayView.test.tsx`
- Create: `components/trace/TopBar.tsx`
- Modify: `components/trace/TraceView.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: TickingNumber**

```tsx
"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { tickSeconds } from "./motion";

/** Eases from the previous value to the new one; renders outside React. */
export function TickingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: tickSeconds, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}
```

- [ ] **Step 2: LiveTotals test (failing)**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveTotals } from "./LiveTotals";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Fix the flaky test",
  model: "claude-fable-5",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:10:00.000Z",
  totals: { inputTokens: 300, outputTokens: 30, toolCalls: 2, durationMs: 600000 },
  steps: [
    { id: "a", index: 0, at: "2026-09-21T10:00:00.000Z", agent: "main", kind: "user", text: "go" },
    { id: "b", index: 1, at: "2026-09-21T10:01:05.000Z", agent: "main", kind: "assistant", tokens: { input: 300, output: 30 } },
  ],
};

describe("LiveTotals", () => {
  it("shows the title and the elapsed session time at the current step", () => {
    render(<LiveTotals trace={trace} index={1} totals={{ input: [0, 300], output: [0, 30], toolCalls: [0, 0] }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Fix the flaky test");
    expect(screen.getByText("1m 5s")).toBeTruthy();
    expect(screen.getByText(/tool calls/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: LiveTotals**

```tsx
"use client";

import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { CumulativeTotals } from "@/lib/replay/totals";
import type { Trace } from "@/lib/trace/types";
import { TickingNumber } from "./TickingNumber";

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">{children}</span>;
}

export function LiveTotals({ trace, index, totals }: { trace: Trace; index: number; totals: CumulativeTotals }) {
  const step = trace.steps[index];
  const elapsed = step ? Math.max(0, Date.parse(step.at) - Date.parse(trace.startedAt)) : 0;
  const at = (arr: number[]) => arr[index] ?? 0;
  return (
    <header className="sticky top-0 z-10 -mx-6 mb-6 border-b border-zinc-800/80 bg-zinc-950/85 px-6 py-4 backdrop-blur">
      <h1 className="truncate text-lg font-semibold text-zinc-50">{trace.title}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        {trace.model && <Chip>{trace.model}</Chip>}
        <Chip>{formatDuration(elapsed)}</Chip>
        <Chip>
          <TickingNumber value={at(totals.input)} format={formatTokens} /> in
        </Chip>
        <Chip>
          <TickingNumber value={at(totals.output)} format={formatTokens} /> out
        </Chip>
        <Chip>
          <TickingNumber value={at(totals.toolCalls)} format={String} /> tool calls
        </Chip>
      </div>
    </header>
  );
}
```

`formatDuration(65000)` is "1m 5s", which the test expects.

- [ ] **Step 4: useReplayKeys**

```ts
"use client";

import { useEffect } from "react";
import type { Player } from "./usePlayer";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Space play/pause, arrows step, Home/End jump, 1/2/4 speed. */
export function useReplayKeys(player: Player) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && EDITABLE.has(target.tagName)) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.stepBy(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.stepBy(-1);
          break;
        case "Home":
          player.seekStep(0);
          break;
        case "End":
          player.seekStep(player.count - 1);
          break;
        case "1":
          player.setSpeed(1);
          break;
        case "2":
          player.setSpeed(2);
          break;
        case "4":
          player.setSpeed(4);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);
}
```

`player` is a new object each render of the hook's caller, so the effect re-subscribes per render; that is fine at this scale (renders happen on index change only).

- [ ] **Step 5: ReplayView test (failing)**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReplayView } from "./ReplayView";
import type { Trace } from "@/lib/trace/types";

const T = (s: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, s)).toISOString();
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Replay me",
  startedAt: T(0),
  endedAt: T(30),
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 1, durationMs: 30000 },
  steps: [
    { id: "s0", index: 0, at: T(0), agent: "main", kind: "user", text: "first", durationMs: 10000 },
    { id: "s1", index: 1, at: T(10), agent: "main", kind: "tool_call", tool: { name: "Read", input: {}, callId: "c" }, durationMs: 10000 },
    { id: "s2", index: 2, at: T(20), agent: "main", kind: "tool_result", result: { callId: "c", output: "ok", isError: false }, durationMs: 10000 },
    { id: "s3", index: 3, at: T(30), agent: "main", kind: "assistant", text: "last", durationMs: 0 },
  ],
};

describe("ReplayView", () => {
  it("starts on the first step and reveals more as you step forward", () => {
    render(<ReplayView trace={trace} warnings={[]} />);
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.queryByText("last")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("running")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.queryByText("running")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("last")).toBeTruthy();
  });

  it("responds to keyboard navigation", () => {
    render(<ReplayView trace={trace} warnings={[]} />);
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByText("last")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Home" });
    expect(screen.queryByText("last")).toBeNull();
  });
});
```

- [ ] **Step 6: ReplayView**

```tsx
"use client";

import { useMemo } from "react";
import { buildSchedule } from "@/lib/replay/schedule";
import { cumulativeTotals } from "@/lib/replay/totals";
import { buildTimeline } from "@/lib/trace/timeline";
import type { Trace } from "@/lib/trace/types";
import { Timeline } from "@/components/trace/Timeline";
import { LiveTotals } from "./LiveTotals";
import { PlayerBar } from "./PlayerBar";
import { usePlayer } from "./usePlayer";
import { useReplayKeys } from "./useReplayKeys";

type Props = { trace: Trace; warnings: string[] };

/** Number of rows whose step index is at most `index` (rows are in step order). */
function visibleCount(rows: { step: { index: number } }[], index: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].step.index <= index) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function ReplayView({ trace }: Props) {
  const schedule = useMemo(() => buildSchedule(trace.steps), [trace]);
  const totals = useMemo(() => cumulativeTotals(trace.steps), [trace]);
  const rows = useMemo(() => buildTimeline(trace), [trace]);
  const player = usePlayer(schedule);
  useReplayKeys(player);

  const visible = useMemo(() => rows.slice(0, visibleCount(rows, player.index)), [rows, player.index]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-32">
      <LiveTotals trace={trace} index={player.index} totals={totals} />
      <Timeline rows={visible} startedAt={trace.startedAt} current={player.index} follow={player.playing} />
      <PlayerBar player={player} />
    </div>
  );
}
```

`warnings` is accepted for parity with `TraceView` but not shown in replay; keep the prop in the type and ignore it (`{ trace }: Props`). If lint flags the unused destructure, drop `warnings` from `Props` and from the callers.

- [ ] **Step 7: TopBar and TraceView**

`components/trace/TopBar.tsx`:

```tsx
"use client";

export type ViewMode = "replay" | "timeline";

type Props = { mode: ViewMode; onMode: (m: ViewMode) => void; onReset: () => void };

export function TopBar({ mode, onMode, onReset }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-8">
      <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
      <div className="flex items-center gap-4">
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
        <button type="button" onClick={onReset} className="text-xs text-zinc-500 hover:text-zinc-200">
          Load another session
        </button>
      </div>
    </div>
  );
}
```

`components/trace/TraceView.tsx`: remove its own top bar block (the `mb-6 flex items-center justify-between` div with the Tracecast label and Load another button) and the `onReset` prop; it now renders header, warnings and timeline only. Props become `{ result: ParseResult }`. Adjust its outer padding to `px-6 pt-6 pb-12`.

- [ ] **Step 8: app/page.tsx**

Add `mode` state and render `TopBar` above either view:

```tsx
"use client";

import { useCallback, useState } from "react";
import { DropZone } from "@/components/trace/DropZone";
import { TopBar, type ViewMode } from "@/components/trace/TopBar";
import { TraceView } from "@/components/trace/TraceView";
import { ReplayView } from "@/components/replay/ReplayView";
import { useFixtureParam } from "@/components/trace/useFixtureParam";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

export default function Home() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("replay");

  const parseFiles = useCallback((files: SessionFile[]) => {
    const parsed = parseClaudeCodeSession(files);
    if (parsed.trace.steps.length === 0) {
      setError("No steps found. Is this a Claude Code session .jsonl?");
      return;
    }
    setError(null);
    setResult(parsed);
  }, []);

  useFixtureParam(parseFiles, setError);

  if (result) {
    return (
      <>
        <TopBar
          mode={mode}
          onMode={setMode}
          onReset={() => {
            setResult(null);
            window.history.replaceState(null, "", "/");
          }}
        />
        {mode === "replay" ? <ReplayView trace={result.trace} warnings={result.warnings} /> : <TraceView result={result} />}
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Tracecast</h1>
      <p className="mt-2 mb-8 text-base text-zinc-400">Turn a Claude Code session into a polished, shareable replay.</p>
      <DropZone onFiles={parseFiles} error={error} />
    </main>
  );
}
```

- [ ] **Step 9: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/replay components/trace/TopBar.tsx components/trace/TraceView.tsx app/page.tsx
git commit -m "feat(replay): live totals, replay view, keyboard nav and mode switch"
```

---

### Task 6: Browser verification, performance and polish

Done by the controller (browser tools). Dev server via `preview_start` name `tracecast`; open `/?fixture=long`, `/?fixture=subagents`, `/?fixture=short`.

- [ ] **Step 1: Behaviour**

Play: steps appear one by one with the enter animation, the current icon has a ring, tool rows show "running" then a check, the token chips tick, the page follows the current row. Pause stops the clock. Scrub: drag to the middle and the visible rows and counters update within one frame. Speed 4x on `long` plays through. Space, arrows, Home, End work and do not scroll the page.

- [ ] **Step 2: Frame rate on long at 4x**

In the browser run, while playing at 4x:

```js
await new Promise(r => { const t=[]; let last=performance.now(); function f(now){ t.push(now-last); last=now; if (t.length<240) requestAnimationFrame(f); else r(t); } requestAnimationFrame(f); }).then(t => { const sorted=[...t].sort((a,b)=>a-b); return { p50: sorted[120], p95: sorted[228], max: sorted[239], over32ms: t.filter(x=>x>32).length }; })
```

Target: p95 under 20 ms, at most a handful of frames over 32 ms. If it misses: check that `LiveTotals` and `PlayerBar` are not re-rendering per frame (React DevTools or a render counter), that `visible` slicing is O(log n), and that the virtualized list is the one rendering (row count over 300).

- [ ] **Step 3: Scrub latency**

Seek to the middle via the slider and measure: `performance.now()` before `player.seek` equivalent (dispatch an input event on the slider) and after the next paint; expect well under 50 ms.

- [ ] **Step 4: Reduced motion and mobile**

`prefers-reduced-motion` emulation is not available in the built-in browser; verify by code review that `useReducedMotion` disables the enter animation. Mobile width: player bar fits, no horizontal scroll.

- [ ] **Step 5: Fix, screenshot, README, commit**

README gains one line under Dev: `Replay: space plays, arrows step, 1/2/4 set speed.` Commit `polish(replay): fixes from browser verification`. Then dispatch the final chunk reviewer, fix Important items, update the plan's roadmap note, and stop for Yarin's go-ahead on chunk 4.

---

## Roadmap notes carried forward

- **Motion-lab swap:** replace `components/replay/motion.ts` presets and the three call sites (StepRow enter, ToolStatusMark pulse, TickingNumber) with motion-lab patterns once `dist-spec/` is copied from Windows. Timing logic in `lib/replay/` does not change.
- **Chunk 4 (share):** redaction UI reuses `SECRET_PATTERNS`, plus a path pattern; uploads the normalized `Trace` JSON only; `/r/[id]` renders `ReplayView` from fetched JSON.
- **Chunk 5 (embed):** `/embed/[id]` is `ReplayView` without `TopBar`, autoplay muted of chrome; OG image draws a mini timeline from `buildSchedule`.
