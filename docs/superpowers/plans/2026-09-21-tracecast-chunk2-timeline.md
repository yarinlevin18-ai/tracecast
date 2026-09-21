# Tracecast Chunk 2: Static Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` accepts dropped session files and renders a readable, static, vertical timeline of the parsed Trace with a totals header, per-kind icons, collapsible tool input/output, indented subagent steps, and virtualization for long sessions.

**Architecture:** Pure presentation logic (formatting, tool summaries, row building) lives in `lib/trace/` with node tests. React components live in `components/trace/` and read only the `Trace` type from chunk 1. `app/page.tsx` is a thin client shell: drop zone until a trace exists, then the trace view. Rows are merged so each tool call row owns its result. Lists over 300 rows use `@tanstack/react-virtual` with window scrolling and measured row heights. No animation in this chunk; chunk 3 layers motion-lab on top.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, `@tanstack/react-virtual`, `lucide-react` icons, Vitest 5 with `jsdom` and `@testing-library/react` for component tests.

**Repo facts:** `/Users/yarin/Projects/tracecast`, npm, commits go straight to `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Chunk 1 delivered `lib/trace/types.ts` (`Trace`, `Step`, `StepKind`, `SessionFile`, `ParseResult`), `parseClaudeCodeSession(files)`, three fixtures under `fixtures/`, a dev page at `app/dev/parse/page.tsx` and a dev-only route `app/dev/fixtures/[name]/route.ts` that returns `SessionFile[]` for `fixtures/<name>`. Style rule: no em dashes in code, comments or copy. Run `npm test`, `npx tsc --noEmit`, `npm run lint` plainly (no piping through grep). `npm install` needs the sandbox disabled.

**Design language (dark, editorial, portfolio quality):** page `bg-zinc-950 text-zinc-100`, surfaces `bg-zinc-900/60 border border-zinc-800`, muted text `text-zinc-400`, mono for code and tool summaries. Per-kind accent: user `sky-400`, assistant `emerald-400`, thinking `violet-400`, tool_call `amber-400`, system `zinc-500`, subagent badge `pink-400`. Rail: a 1px `bg-zinc-800` vertical line on the left with the kind icon sitting on it in a `bg-zinc-950` circle. Body copy `text-sm leading-6`, max width `max-w-3xl` centered.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/trace/format.ts` | `formatTokens`, `formatDuration`, `formatOffset` (pure) |
| `lib/trace/summary.ts` | `toolSummary(tool)` one-line label per tool call (pure) |
| `lib/trace/timeline.ts` | `buildTimeline(trace)` -> `TimelineRow[]` (merges results into calls, sets depth) |
| `components/trace/useFixtureParam.ts` | reads `?fixture=` in dev and fetches `SessionFile[]` |
| `components/trace/DropZone.tsx` | drag and drop plus file input, emits `SessionFile[]` |
| `components/trace/TraceHeader.tsx` | title, model, date, totals chips |
| `components/trace/StepIcon.tsx` | icon plus color per `StepKind` |
| `components/trace/StepRow.tsx` | one row: rail icon, body per kind, collapsible tool panel |
| `components/trace/Timeline.tsx` | list of rows, virtualized past 300 |
| `components/trace/TraceView.tsx` | header plus timeline plus "load another" |
| `app/page.tsx` | client shell: DropZone or TraceView |
| `app/layout.tsx`, `app/globals.css` | Tracecast metadata, dark base, font wiring |

---

### Task 1: Dependencies and component test environment

**Files:**
- Modify: `package.json` (via npm)
- Modify: `vitest.config.mts`
- Create: `components/trace/__smoke__.test.tsx` (deleted at the end of the task)

- [ ] **Step 1: Install**

```bash
cd /Users/yarin/Projects/tracecast
npm install @tanstack/react-virtual lucide-react
npm install -D jsdom @testing-library/react
```

Expected: no ERESOLVE. If `@testing-library/react` peers complain about React 19, retry with `--legacy-peer-deps` and note it in the report.

- [ ] **Step 2: Vitest config**

Replace `vitest.config.mts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "components/**/*.test.tsx"],
    environment: "node",
  },
  resolve: { alias: { "@": import.meta.dirname } },
});
```

Component test files opt into jsdom with a docblock on line 1: `// @vitest-environment jsdom`.

- [ ] **Step 3: Smoke test**

Create `components/trace/__smoke__.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("renders JSX under jsdom", () => {
  render(<p>hello</p>);
  expect(screen.getByText("hello")).toBeTruthy();
});
```

Run `npm test`. Expected: 62 passed. Then delete the smoke file.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.mts
git commit -m "chore: add react-virtual, lucide icons and jsdom component testing"
```

---

### Task 2: Formatting helpers

**Files:**
- Create: `lib/trace/format.ts`
- Test: `lib/trace/format.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatOffset, formatTokens } from "./format";

describe("formatTokens", () => {
  it("keeps small numbers, abbreviates thousands and millions", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatTokens(15000)).toBe("15k");
    expect(formatTokens(279185)).toBe("279k");
    expect(formatTokens(50902560)).toBe("50.9M");
  });
});

describe("formatDuration", () => {
  it("picks the two most significant units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(900)).toBe("0.9s");
    expect(formatDuration(3400)).toBe("3.4s");
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(3720000)).toBe("1h 2m");
    expect(formatDuration(162780981)).toBe("1d 21h");
  });
});

describe("formatOffset", () => {
  it("formats a millisecond offset as +m:ss or +h:mm:ss", () => {
    expect(formatOffset(0)).toBe("+0:00");
    expect(formatOffset(65000)).toBe("+1:05");
    expect(formatOffset(3725000)).toBe("+1:02:05");
  });
});
```

Run: `npm test`. Expected: FAIL, module not found.

- [ ] **Step 2: Implementation**

```ts
/** 1234 -> "1.2k", 50902560 -> "50.9M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return trim(n / 1000) + "k";
  return trim(n / 1_000_000) + "M";
}

/** One decimal below 100, none above: 1.2, 15, 50.9, 279. */
function trim(x: number): string {
  return x < 100 ? x.toFixed(1).replace(/\.0$/, "") : String(Math.round(x));
}

/** Two most significant units: "3.4s", "1m 5s", "1h 2m", "1d 21h". */
export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace(/\.0$/, "") : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Offset from session start: "+1:05" or "+1:02:05". */
export function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mmss = h > 0 ? `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `+${h}:${mmss}` : `+${mmss}`;
}
```

Note `formatDuration(0)` must give `0s` (the sub-10 branch yields "0" after trimming ".0"). `formatDuration(900)` gives `0.9s`.

- [ ] **Step 3: Run, commit**

`npm test` expected all pass.

```bash
git add lib/trace/format.ts lib/trace/format.test.ts
git commit -m "feat(trace): token, duration and offset formatters"
```

---

### Task 3: Tool summaries

**Files:**
- Create: `lib/trace/summary.ts`
- Test: `lib/trace/summary.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { toolSummary } from "./summary";

describe("toolSummary", () => {
  it("shows the path for file tools", () => {
    expect(toolSummary({ name: "Read", input: { file_path: "/Users/dev/app/page.tsx" }, callId: "c" })).toBe("/Users/dev/app/page.tsx");
    expect(toolSummary({ name: "Edit", input: { file_path: "a.ts", old_string: "x" }, callId: "c" })).toBe("a.ts");
    expect(toolSummary({ name: "Write", input: { file_path: "b.ts" }, callId: "c" })).toBe("b.ts");
  });

  it("shows the first line of a Bash command", () => {
    expect(toolSummary({ name: "Bash", input: { command: "npm test\necho done" }, callId: "c" })).toBe("npm test");
  });

  it("shows pattern for Grep and Glob, description for Agent, skill name for Skill", () => {
    expect(toolSummary({ name: "Grep", input: { pattern: "TODO", path: "src" }, callId: "c" })).toBe("TODO in src");
    expect(toolSummary({ name: "Glob", input: { pattern: "**/*.ts" }, callId: "c" })).toBe("**/*.ts");
    expect(toolSummary({ name: "Agent", input: { description: "Review captions", prompt: "..." }, callId: "c" })).toBe("Review captions");
    expect(toolSummary({ name: "Skill", input: { skill: "brainstorming" }, callId: "c" })).toBe("brainstorming");
  });

  it("falls back to compact JSON, truncated to 80 chars", () => {
    const s = toolSummary({ name: "Other", input: { a: "x".repeat(200) }, callId: "c" });
    expect(s.length).toBe(80);
    expect(s.endsWith("...")).toBe(true);
    expect(toolSummary({ name: "Other", input: {}, callId: "c" })).toBe("");
  });
});
```

- [ ] **Step 2: Implementation**

```ts
import type { Step } from "./types";

type Tool = NonNullable<Step["tool"]>;
const MAX = 80;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** One-line label for a tool call, used in timeline rows. */
export function toolSummary(tool: Tool): string {
  const input = (tool.input ?? {}) as Record<string, unknown>;
  switch (tool.name) {
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return str(input.file_path) ?? str(input.notebook_path) ?? fallback(input);
    case "Bash":
      return (str(input.command) ?? "").split("\n")[0].trim() || fallback(input);
    case "Grep": {
      const p = str(input.pattern);
      const where = str(input.path);
      return p ? (where ? `${p} in ${where}` : p) : fallback(input);
    }
    case "Glob":
      return str(input.pattern) ?? fallback(input);
    case "Agent":
      return str(input.description) ?? fallback(input);
    case "Skill":
      return str(input.skill) ?? fallback(input);
    case "WebFetch":
    case "WebSearch":
      return str(input.url) ?? str(input.query) ?? fallback(input);
    default:
      return fallback(input);
  }
}

function fallback(input: Record<string, unknown>): string {
  if (Object.keys(input).length === 0) return "";
  const json = JSON.stringify(input);
  return json.length > MAX ? json.slice(0, MAX - 3) + "..." : json;
}
```

- [ ] **Step 3: Run, commit**

```bash
git add lib/trace/summary.ts lib/trace/summary.test.ts
git commit -m "feat(trace): one-line tool call summaries"
```

---

### Task 4: Timeline rows

**Files:**
- Create: `lib/trace/timeline.ts`
- Test: `lib/trace/timeline.test.ts`

Rows are the Trace steps in order, except that each `tool_result` whose call exists is folded into that call's row (`row.result`) and dropped as a standalone row. Orphan results stay as rows. `depth` is 1 for any step with a `parentId` (subagent steps), else 0.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildTimeline, shouldVirtualize } from "./timeline";
import type { Step, Trace } from "./types";

const T = "2026-09-21T10:00:00.000Z";

function step(partial: Partial<Step> & Pick<Step, "id" | "kind">): Step {
  return { index: 0, at: T, agent: "main", durationMs: 0, ...partial };
}

function trace(steps: Step[]): Trace {
  return {
    id: "t",
    source: "claude-code",
    title: "t",
    startedAt: T,
    endedAt: T,
    totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
    steps: steps.map((s, index) => ({ ...s, index })),
  };
}

describe("buildTimeline", () => {
  it("folds each tool_result into its call and keeps orphans", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "u", kind: "user", text: "hi" }),
        step({ id: "c1", kind: "tool_call", tool: { name: "Read", input: {}, callId: "call-1" } }),
        step({ id: "r1", kind: "tool_result", result: { callId: "call-1", output: "ok", isError: false } }),
        step({ id: "r2", kind: "tool_result", result: { callId: "missing", output: "?", isError: true } }),
      ])
    );
    expect(rows.map((r) => r.step.id)).toEqual(["u", "c1", "r2"]);
    expect(rows[1].result?.output).toBe("ok");
    expect(rows[2].result).toBeUndefined();
  });

  it("marks subagent steps as depth 1", () => {
    const rows = buildTimeline(
      trace([
        step({ id: "a", kind: "tool_call", tool: { name: "Agent", input: {}, callId: "agent-1" } }),
        step({ id: "s", kind: "user", agent: "Reviewer", parentId: "a", text: "go" }),
      ])
    );
    expect(rows.map((r) => r.depth)).toEqual([0, 1]);
  });

  it("uses step ids as row keys", () => {
    const rows = buildTimeline(trace([step({ id: "x", kind: "system", text: "Context compacted" })]));
    expect(rows[0].key).toBe("x");
  });
});

describe("shouldVirtualize", () => {
  it("kicks in above 300 rows", () => {
    expect(shouldVirtualize(300)).toBe(false);
    expect(shouldVirtualize(301)).toBe(true);
  });
});
```

- [ ] **Step 2: Implementation**

```ts
import type { Step, Trace } from "./types";

export type TimelineRow = {
  key: string;
  step: Step;
  /** 0 for main session steps, 1 for subagent steps. */
  depth: 0 | 1;
  /** The tool_result folded into a tool_call row, when found. */
  result?: NonNullable<Step["result"]>;
};

export const VIRTUALIZE_ABOVE = 300;

export function shouldVirtualize(rowCount: number): boolean {
  return rowCount > VIRTUALIZE_ABOVE;
}

/** Steps in order, with tool results folded into their calls. */
export function buildTimeline(trace: Trace): TimelineRow[] {
  const resultByCall = new Map<string, NonNullable<Step["result"]>>();
  const callIds = new Set<string>();
  for (const s of trace.steps) {
    if (s.kind === "tool_call" && s.tool) callIds.add(s.tool.callId);
    if (s.kind === "tool_result" && s.result && !resultByCall.has(s.result.callId)) resultByCall.set(s.result.callId, s.result);
  }

  const rows: TimelineRow[] = [];
  for (const s of trace.steps) {
    if (s.kind === "tool_result" && s.result && callIds.has(s.result.callId)) continue;
    const row: TimelineRow = { key: s.id, step: s, depth: s.parentId ? 1 : 0 };
    if (s.kind === "tool_call" && s.tool) {
      const r = resultByCall.get(s.tool.callId);
      if (r) row.result = r;
    }
    rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 3: Run, commit**

```bash
git add lib/trace/timeline.ts lib/trace/timeline.test.ts
git commit -m "feat(trace): build timeline rows with folded tool results"
```

---

### Task 5: App shell, DropZone and fixture hook

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`
- Create: `components/trace/useFixtureParam.ts`
- Create: `components/trace/DropZone.tsx`
- Test: `components/trace/DropZone.test.tsx`
- Modify: `app/dev/parse/page.tsx` (use the hook and DropZone, drop its inline copies)

- [ ] **Step 1: Layout and globals**

`app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tracecast",
  description: "Turn a Claude Code session into a polished, shareable replay.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
```

`app/globals.css`:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

Delete `public/next.svg`, `public/vercel.svg` and any other scaffold svgs that `app/page.tsx` stops using (check with `grep -r "svg" app`).

- [ ] **Step 2: Fixture hook**

`components/trace/useFixtureParam.ts`:

```ts
"use client";

import { useEffect } from "react";
import type { SessionFile } from "@/lib/trace/types";

export const FIXTURE_NAMES = ["short", "subagents", "long"] as const;
export const isDev = process.env.NODE_ENV === "development";

/**
 * Dev convenience: when the URL has ?fixture=<name>, fetch fixtures/<name>
 * from the dev-only route and hand the files to the caller.
 */
export function useFixtureParam(onFiles: (files: SessionFile[]) => void, onError: (msg: string) => void) {
  useEffect(() => {
    if (!isDev) return;
    const name = new URLSearchParams(window.location.search).get("fixture");
    if (!name) return;
    let cancelled = false;
    fetch(`/dev/fixtures/${encodeURIComponent(name)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`fixture "${name}" not found (${res.status})`);
        const files = (await res.json()) as SessionFile[];
        if (!cancelled) onFiles(files);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount; callers pass stable handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 3: DropZone test (failing)**

`components/trace/DropZone.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

describe("DropZone", () => {
  it("reads picked files and reports name and text", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    const file = new File(['{"type":"user"}\n'], "main.jsonl", { type: "application/x-ndjson" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toEqual([{ name: "main.jsonl", text: '{"type":"user"}\n' }]);
  });

  it("accepts dropped files", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);
    const zone = screen.getByTestId("dropzone");
    const file = new File(["x"], "agent-1.jsonl");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0][0].name).toBe("agent-1.jsonl");
  });
});
```

- [ ] **Step 4: DropZone**

`components/trace/DropZone.tsx`:

```tsx
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
```

The `label` text "Choose files" is what `getByLabelText(/choose files/i)` finds.

- [ ] **Step 5: Dev page uses the shared pieces**

Rewrite `app/dev/parse/page.tsx` so it keeps its summary/warnings/JSON dump but uses `DropZone` and `useFixtureParam`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { DropZone } from "@/components/trace/DropZone";
import { useFixtureParam } from "@/components/trace/useFixtureParam";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

const PREVIEW_STEPS = 500;

export default function DevParsePage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const parseFiles = useCallback((files: SessionFile[]) => {
    const t0 = performance.now();
    const parsed = parseClaudeCodeSession(files);
    setMs(Math.round(performance.now() - t0));
    setResult(parsed);
    setError(null);
  }, []);

  useFixtureParam(parseFiles, setError);

  const trace = result?.trace;
  const preview = trace ? { ...trace, steps: trace.steps.slice(0, PREVIEW_STEPS) } : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg font-bold">Tracecast dev: parse</h1>
      <DropZone onFiles={parseFiles} error={error} />

      {result && trace && (
        <>
          <h2 className="mt-8 font-bold">Summary ({ms} ms)</h2>
          <pre className="mt-2 rounded bg-zinc-900 p-4">
            {JSON.stringify(
              {
                id: trace.id,
                title: trace.title,
                model: trace.model,
                startedAt: trace.startedAt,
                endedAt: trace.endedAt,
                totals: trace.totals,
                steps: trace.steps.length,
                agents: Array.from(new Set(trace.steps.map((s) => s.agent))),
                warnings: result.warnings.length,
              },
              null,
              2
            )}
          </pre>

          <h2 className="mt-8 font-bold">Warnings ({result.warnings.length})</h2>
          <ul className="mt-2 list-disc pl-6">
            {result.warnings.slice(0, 100).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>

          <h2 className="mt-8 font-bold">
            Trace JSON{trace.steps.length > PREVIEW_STEPS ? ` (first ${PREVIEW_STEPS} of ${trace.steps.length} steps)` : ""}
          </h2>
          <pre className="mt-2 max-h-[70vh] overflow-auto rounded bg-zinc-900 p-4">{JSON.stringify(preview, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run, lint, type-check, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add app/layout.tsx app/globals.css components/trace/useFixtureParam.ts components/trace/DropZone.tsx components/trace/DropZone.test.tsx app/dev/parse/page.tsx
git rm -q public/next.svg public/vercel.svg 2>/dev/null; git add -A public
git commit -m "feat(ui): app shell, DropZone and shared fixture hook"
```

`app/page.tsx` still renders the scaffold at this point and may reference deleted svgs; if `npm run lint` or `tsc` complains about it, replace `app/page.tsx` with a placeholder that renders `<main />` and note it; Task 7 rewrites it.

---

### Task 6: Header, icons and step rows

**Files:**
- Create: `components/trace/TraceHeader.tsx`
- Create: `components/trace/StepIcon.tsx`
- Create: `components/trace/StepRow.tsx`
- Test: `components/trace/StepRow.test.tsx`, `components/trace/TraceHeader.test.tsx`

- [ ] **Step 1: Failing tests**

`components/trace/TraceHeader.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceHeader } from "./TraceHeader";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Fix the flaky test",
  model: "claude-fable-5",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:01:05.000Z",
  totals: { inputTokens: 50902560, outputTokens: 279185, toolCalls: 397, durationMs: 65000 },
  steps: [],
};

describe("TraceHeader", () => {
  it("shows title, model and formatted totals", () => {
    render(<TraceHeader trace={trace} agentCount={6} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Fix the flaky test");
    expect(screen.getByText("claude-fable-5")).toBeTruthy();
    expect(screen.getByText("50.9M in")).toBeTruthy();
    expect(screen.getByText("279k out")).toBeTruthy();
    expect(screen.getByText("397 tool calls")).toBeTruthy();
    expect(screen.getByText("1m 5s")).toBeTruthy();
    expect(screen.getByText("6 agents")).toBeTruthy();
  });
});
```

`components/trace/StepRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepRow } from "./StepRow";
import type { TimelineRow } from "@/lib/trace/timeline";
import type { Step } from "@/lib/trace/types";

const T0 = "2026-09-21T10:00:00.000Z";

function row(step: Partial<Step> & Pick<Step, "id" | "kind">, extra: Partial<TimelineRow> = {}): TimelineRow {
  const s: Step = { index: 0, at: "2026-09-21T10:01:05.000Z", agent: "main", durationMs: 0, ...step };
  return { key: s.id, step: s, depth: 0, ...extra };
}

describe("StepRow", () => {
  it("renders user text with an offset from session start", () => {
    render(<StepRow row={row({ id: "u", kind: "user", text: "Fix it" })} startedAt={T0} />);
    expect(screen.getByText("Fix it")).toBeTruthy();
    expect(screen.getByText("+1:05")).toBeTruthy();
  });

  it("renders a tool call with its summary and toggles input and output", () => {
    const r = row(
      { id: "c", kind: "tool_call", tool: { name: "Read", input: { file_path: "a.ts" }, callId: "x" } },
      { result: { callId: "x", output: "const a = 1;", isError: false } }
    );
    render(<StepRow row={r} startedAt={T0} />);
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.queryByText("const a = 1;")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("const a = 1;")).toBeTruthy();
    expect(screen.getByText(/"file_path": "a.ts"/)).toBeTruthy();
  });

  it("collapses thinking by default and shows the agent badge for subagent steps", () => {
    render(
      <StepRow
        row={row({ id: "t", kind: "thinking", text: "deep thoughts", agent: "Reviewer", parentId: "p" }, { depth: 1 })}
        startedAt={T0}
      />
    );
    expect(screen.queryByText("deep thoughts")).toBeNull();
    expect(screen.getByText("Reviewer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /thinking/i }));
    expect(screen.getByText("deep thoughts")).toBeTruthy();
  });

  it("marks failed tool results", () => {
    const r = row(
      { id: "c", kind: "tool_call", tool: { name: "Bash", input: { command: "false" }, callId: "x" } },
      { result: { callId: "x", output: "exit 1", isError: true } }
    );
    render(<StepRow row={r} startedAt={T0} />);
    expect(screen.getByText("failed")).toBeTruthy();
  });
});
```

- [ ] **Step 2: StepIcon**

```tsx
import { Bot, Brain, GitBranch, Info, User, Wrench } from "lucide-react";
import type { StepKind } from "@/lib/trace/types";

const ICONS: Record<StepKind, { Icon: typeof User; color: string; label: string }> = {
  user: { Icon: User, color: "text-sky-400", label: "User" },
  assistant: { Icon: Bot, color: "text-emerald-400", label: "Assistant" },
  thinking: { Icon: Brain, color: "text-violet-400", label: "Thinking" },
  tool_call: { Icon: Wrench, color: "text-amber-400", label: "Tool call" },
  tool_result: { Icon: Wrench, color: "text-amber-400", label: "Tool result" },
  subagent: { Icon: GitBranch, color: "text-pink-400", label: "Subagent" },
  system: { Icon: Info, color: "text-zinc-500", label: "System" },
};

export function stepColor(kind: StepKind): string {
  return ICONS[kind].color;
}

export function StepIcon({ kind, className = "h-4 w-4" }: { kind: StepKind; className?: string }) {
  const { Icon, color, label } = ICONS[kind];
  return <Icon className={`${className} ${color}`} aria-label={label} role="img" />;
}
```

- [ ] **Step 3: TraceHeader**

```tsx
import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { Trace } from "@/lib/trace/types";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">{children}</span>
  );
}

export function TraceHeader({ trace, agentCount }: { trace: Trace; agentCount: number }) {
  const started = new Date(trace.startedAt);
  const date = Number.isNaN(started.getTime())
    ? ""
    : started.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <header className="mb-10">
      <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Claude Code session</p>
      <h1 className="text-2xl font-semibold leading-tight text-zinc-50 sm:text-3xl">{trace.title}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {trace.model && <Chip>{trace.model}</Chip>}
        {date && <Chip>{date}</Chip>}
        <Chip>{formatDuration(trace.totals.durationMs)}</Chip>
        <Chip>{formatTokens(trace.totals.inputTokens)} in</Chip>
        <Chip>{formatTokens(trace.totals.outputTokens)} out</Chip>
        <Chip>{trace.totals.toolCalls} tool calls</Chip>
        {agentCount > 1 && <Chip>{agentCount} agents</Chip>}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: StepRow**

```tsx
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatOffset, formatTokens } from "@/lib/trace/format";
import { toolSummary } from "@/lib/trace/summary";
import type { TimelineRow } from "@/lib/trace/timeline";
import { StepIcon } from "./StepIcon";

const LONG_TEXT = 1200;

type Props = { row: TimelineRow; startedAt: string };

export function StepRow({ row, startedAt }: Props) {
  const { step, depth, result } = row;
  const offset = formatOffset(Math.max(0, Date.parse(step.at) - Date.parse(startedAt)));

  return (
    <article className={`relative flex gap-4 py-3 ${depth === 1 ? "pl-10" : ""}`} data-kind={step.kind} data-depth={depth}>
      <div className="relative flex w-6 shrink-0 justify-center">
        <span className="absolute top-0 bottom-0 w-px bg-zinc-800" aria-hidden />
        <span className="relative mt-1 rounded-full bg-zinc-950 p-1">
          <StepIcon kind={step.kind} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          {depth === 1 && (
            <span className="rounded bg-pink-400/10 px-1.5 py-0.5 text-[11px] font-medium text-pink-300">{step.agent}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-600">
            {step.tokens?.output ? `${formatTokens(step.tokens.output)} out  ` : ""}
            {offset}
          </span>
        </div>
        <Body row={row} />
      </div>
    </article>
  );
}

function Body({ row }: { row: TimelineRow }) {
  const { step, result } = row;
  switch (step.kind) {
    case "thinking":
      return <Collapsible label="Thinking" summary={`${(step.text ?? "").length} chars`} muted>{step.text ?? ""}</Collapsible>;
    case "tool_call":
      return <ToolBody row={row} />;
    case "tool_result":
      return <Output output={step.result?.output ?? ""} isError={step.result?.isError ?? false} />;
    case "system":
      return <p className="text-xs text-zinc-500">{step.text}</p>;
    default:
      return <LongText text={step.text ?? ""} className={step.kind === "user" ? "text-zinc-100" : "text-zinc-300"} />;
  }
}

function ToolBody({ row }: { row: TimelineRow }) {
  const { step, result } = row;
  const [open, setOpen] = useState(false);
  const tool = step.tool!;
  const summary = toolSummary(tool);
  return (
    <div>
      <button
        type="button"
        aria-label={`${tool.name} details`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-baseline gap-2 text-left"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 self-center text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <span className="font-medium text-amber-300">{tool.name}</span>
        {summary && <span className="truncate font-mono text-xs text-zinc-400">{summary}</span>}
        {result?.isError && <span className="rounded bg-red-400/10 px-1.5 text-[11px] text-red-300">failed</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Panel title="Input">{JSON.stringify(tool.input, null, 2)}</Panel>
          {result && (
            <Panel title="Output" isError={result.isError}>
              {result.output}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, isError = false }: { title: string; children: string; isError?: boolean }) {
  return (
    <div className={`rounded-lg border ${isError ? "border-red-900/60" : "border-zinc-800"} bg-zinc-900/60`}>
      <p className="border-b border-zinc-800 px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-500">{title}</p>
      <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-zinc-300">{children}</pre>
    </div>
  );
}

function Output({ output, isError }: { output: string; isError: boolean }) {
  return <Panel title={isError ? "Output (failed)" : "Output"} isError={isError}>{output}</Panel>;
}

function Collapsible({ label, summary, muted = false, children }: { label: string; summary: string; muted?: boolean; children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {label} <span className="text-zinc-600">{summary}</span>
      </button>
      {open && <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${muted ? "italic text-zinc-400" : "text-zinc-300"}`}>{children}</p>}
    </div>
  );
}

function LongText({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_TEXT;
  const shown = long && !open ? text.slice(0, LONG_TEXT) + "..." : text;
  return (
    <div>
      <p className={`whitespace-pre-wrap text-sm leading-6 ${className}`}>{shown}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
```

Remove the unused `result` binding in `StepRow` if lint flags it (it is only used in `Body`/`ToolBody`).

- [ ] **Step 5: Run, lint, type-check, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/trace/StepIcon.tsx components/trace/TraceHeader.tsx components/trace/StepRow.tsx components/trace/StepRow.test.tsx components/trace/TraceHeader.test.tsx
git commit -m "feat(ui): trace header, step icons and collapsible step rows"
```

---

### Task 7: Timeline, TraceView and the home page

**Files:**
- Create: `components/trace/Timeline.tsx`
- Create: `components/trace/TraceView.tsx`
- Test: `components/trace/Timeline.test.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Failing test**

`components/trace/Timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import type { TimelineRow } from "@/lib/trace/timeline";

const T = "2026-09-21T10:00:00.000Z";

function rows(n: number): TimelineRow[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `s${i}`,
    depth: 0,
    step: { id: `s${i}`, index: i, at: T, agent: "main", kind: "user", text: `msg ${i}`, durationMs: 0 },
  }));
}

describe("Timeline", () => {
  it("renders every row when the list is short", () => {
    const { container } = render(<Timeline rows={rows(5)} startedAt={T} />);
    expect(container.querySelectorAll("article").length).toBe(5);
  });

  it("switches to the virtualized list above the threshold", () => {
    const { container } = render(<Timeline rows={rows(301)} startedAt={T} />);
    expect(container.querySelector("[data-virtualized]")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Timeline**

```tsx
"use client";

import { useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { shouldVirtualize, type TimelineRow } from "@/lib/trace/timeline";
import { StepRow } from "./StepRow";

type Props = { rows: TimelineRow[]; startedAt: string };

export function Timeline({ rows, startedAt }: Props) {
  if (!shouldVirtualize(rows.length)) {
    return (
      <div>
        {rows.map((row) => (
          <StepRow key={row.key} row={row} startedAt={startedAt} />
        ))}
      </div>
    );
  }
  return <VirtualTimeline rows={rows} startedAt={startedAt} />;
}

function VirtualTimeline({ rows, startedAt }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 64,
    overscan: 12,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (i) => rows[i].key,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} data-virtualized style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateY(${(items[0]?.start ?? 0) - virtualizer.options.scrollMargin}px)`,
        }}
      >
        {items.map((item) => (
          <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
            <StepRow row={rows[item.index]} startedAt={startedAt} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TraceView**

```tsx
"use client";

import { useMemo } from "react";
import { buildTimeline } from "@/lib/trace/timeline";
import type { ParseResult } from "@/lib/trace/types";
import { Timeline } from "./Timeline";
import { TraceHeader } from "./TraceHeader";

type Props = { result: ParseResult; onReset: () => void };

export function TraceView({ result, onReset }: Props) {
  const { trace, warnings } = result;
  const rows = useMemo(() => buildTimeline(trace), [trace]);
  const agentCount = useMemo(() => new Set(trace.steps.map((s) => s.agent)).size, [trace]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
        <button type="button" onClick={onReset} className="text-xs text-zinc-500 hover:text-zinc-200">
          Load another session
        </button>
      </div>
      <TraceHeader trace={trace} agentCount={agentCount} />
      {warnings.length > 0 && (
        <details className="mb-6 rounded-lg border border-amber-900/50 bg-amber-400/5 px-4 py-2 text-xs text-amber-200">
          <summary className="cursor-pointer">
            {warnings.length} parser warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 list-disc pl-5 text-amber-200/80">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <Timeline rows={rows} startedAt={trace.startedAt} />
    </div>
  );
}
```

- [ ] **Step 4: Home page**

`app/page.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { DropZone } from "@/components/trace/DropZone";
import { TraceView } from "@/components/trace/TraceView";
import { useFixtureParam } from "@/components/trace/useFixtureParam";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

export default function Home() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <TraceView
        result={result}
        onReset={() => {
          setResult(null);
          window.history.replaceState(null, "", "/");
        }}
      />
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

- [ ] **Step 5: Run, lint, type-check, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/trace/Timeline.tsx components/trace/Timeline.test.tsx components/trace/TraceView.tsx app/page.tsx
git commit -m "feat(ui): static timeline with virtualization and the home page"
```

---

### Task 8: Browser verification and polish

**Files:**
- Modify: whatever the checks below reveal
- Modify: `README.md`

Done by the controller (needs the browser tools), not a subagent.

- [ ] **Step 1: Open each fixture**

Dev server: `preview_start` name `tracecast` (config lives in `~/Projects/.claude/launch.json`, autoPort). Open `/?fixture=short`, `/?fixture=subagents`, `/?fixture=long` in the built-in browser.

Check on each: header totals match `/dev/parse`, rows readable, tool rows expand and collapse, thinking collapsed, subagent rows indented with a pink agent badge, no console errors. On `long` (over 1000 rows): scrolling is smooth, rows near the end render, expanding a row does not overlap the next one (measured heights), no layout jumps at the top.

- [ ] **Step 2: Mobile width**

`resize_window` preset `mobile`: no horizontal scroll, chips wrap, rail still aligned. Reset to desktop.

- [ ] **Step 3: Fix and screenshot**

Fix anything found (small edits inline, larger ones via an implementer). Take one screenshot of `long` for the chunk summary. Update `README.md` Dev section:

```md
## Dev

    npm install
    npm run dev          # http://localhost:3000  (dev: /?fixture=long)
    npm test
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "polish(ui): timeline fixes from browser verification"
```

Then dispatch the final chunk reviewer, fix Important items, and stop for Yarin's go-ahead on chunk 3 (which needs motion-lab copied from Windows first).

---

## Roadmap notes carried forward

- **Chunk 3 (replay):** needs motion-lab `dist-spec/` on this Mac. Playback clock maps each step's `durationMs` through a cap (about 1.5 s of playback per gap) and a global scale so total playback lands near 60 s. Token counter animates cumulatively from `steps[i].tokens`. The `TimelineRow` folding done here is presentation only; the replay clock still walks `trace.steps`.
- **Chunk 4 (share):** redaction UI reuses `SECRET_PATTERNS` to auto-flag, plus a path pattern. Uploads the normalized `Trace` JSON only.
