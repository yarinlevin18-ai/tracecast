# Tracecast Chunk 5: Embed and previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared replay gets a rich link preview (Open Graph image with title, model, totals and a mini timeline) and can be embedded in any page through `/embed/[id]`.

**Architecture:** The share page's trace loader moves into `lib/share/load.ts` so the page, the OG image route and the embed page share one cached loader. The OG image is a `next/og` `ImageResponse` at `app/r/[id]/opengraph-image.tsx` fed by pure helpers in `lib/share/og.ts` (chips text, title clamp, a bucketed kind strip). The embed is a server page at `app/embed/[id]/page.tsx` rendering `ReplayView` in a compact mode with optional autoplay. The share dialog's done state gains an iframe snippet.

**Tech Stack:** Next.js 16 App Router, `next/og` (`ImageResponse`), React 19, Vitest 5, existing replay components.

---

## File structure

- `lib/share/load.ts` (new): `loadSharedTrace(id)` = React `cache` around `loadTrace(getAdminClient())`, null when sharing is not configured. Server only.
- `lib/share/og.ts` (new): pure helpers for the OG image and metadata: `clampTitle`, `describeTrace`, `kindStrip`, `KIND_COLORS`.
- `lib/share/og.test.ts` (new).
- `app/r/[id]/page.tsx` (modify): use `loadSharedTrace`, richer `generateMetadata` (description, openGraph, twitter, robots noindex).
- `app/r/[id]/opengraph-image.tsx` (new): 1200x630 PNG.
- `app/layout.tsx` (modify): `metadataBase` from `NEXT_PUBLIC_SITE_URL`.
- `.env.example`, `README.md` (modify): document `NEXT_PUBLIC_SITE_URL`.
- `components/replay/ReplayView.tsx` (modify): `compact` and `autoplay` props.
- `components/replay/ReplayView.test.tsx` (modify): autoplay test.
- `components/embed/EmbedReplay.tsx` (new): compact chrome for iframes.
- `app/embed/[id]/page.tsx` (new): server page, `robots: noindex`, reads `?autoplay=1`.
- `components/share/ShareDialog.tsx` + test (modify): embed snippet in the done state.

Done means: `/r/<id>` serves `og:image`, `og:title`, `og:description`, `twitter:card=summary_large_image`; the image renders title, model, totals and the strip; `/embed/<id>` plays inside an iframe on a plain HTML page; the dialog offers a copyable iframe snippet.

---

### Task 1: Shared loader, OG helpers, metadata base

**Files:**
- Create: `lib/share/load.ts`, `lib/share/og.ts`, `lib/share/og.test.ts`
- Modify: `app/r/[id]/page.tsx`, `app/layout.tsx`, `.env.example`, `README.md`

- [ ] **Step 1: og helper tests (failing)**

`lib/share/og.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampTitle, describeTrace, kindStrip } from "./og";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (i: number, kind: Step["kind"]): Step => ({ id: `s${i}`, index: i, at: T, agent: "main", kind, durationMs: 1000 });
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Build the thing",
  startedAt: T,
  endedAt: T,
  model: "claude-fable-5",
  totals: { inputTokens: 50_902_560, outputTokens: 279_185, toolCalls: 397, durationMs: 9_900_000 },
  steps: [],
};

describe("clampTitle", () => {
  it("keeps short titles and trims long ones on a word boundary", () => {
    expect(clampTitle("Build the thing", 80)).toBe("Build the thing");
    expect(clampTitle("one two three four five", 12)).toBe("one two...");
    expect(clampTitle("x".repeat(100), 10)).toBe("xxxxxxx...");
  });
});

describe("describeTrace", () => {
  it("summarizes steps, tokens, tool calls and duration", () => {
    const t = { ...trace, steps: [step(0, "user"), step(1, "assistant")] };
    expect(describeTrace(t)).toBe("2 steps, 50.9M tokens in, 279k out, 397 tool calls, 2h 45m with claude-fable-5");
  });

  it("omits the model when unknown", () => {
    const t = { ...trace, model: undefined, steps: [step(0, "user")] };
    expect(describeTrace(t)).toBe("1 step, 50.9M tokens in, 279k out, 397 tool calls, 2h 45m");
  });
});

describe("kindStrip", () => {
  it("buckets steps into n cells using the most common kind per cell", () => {
    const steps = [step(0, "user"), step(1, "tool_call"), step(2, "tool_call"), step(3, "assistant")];
    expect(kindStrip(steps, 2)).toEqual(["user", "tool_call"]);
    expect(kindStrip(steps, 4)).toEqual(["user", "tool_call", "tool_call", "assistant"]);
  });

  it("repeats steps when there are fewer steps than cells and handles empty", () => {
    expect(kindStrip([step(0, "user"), step(1, "assistant")], 4)).toEqual(["user", "user", "assistant", "assistant"]);
    expect(kindStrip([], 3)).toEqual(["system", "system", "system"]);
  });
});
```

- [ ] **Step 2: og helpers**

`lib/share/og.ts`:

```ts
import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { Step, StepKind, Trace } from "@/lib/trace/types";

/** Hex colours per step kind, matching the Tailwind classes in StepIcon. */
export const KIND_COLORS: Record<StepKind, string> = {
  user: "#38bdf8",
  assistant: "#34d399",
  thinking: "#a78bfa",
  tool_call: "#fbbf24",
  tool_result: "#fbbf24",
  subagent: "#f472b6",
  system: "#52525b",
};

/** Cuts a title to max chars on a word boundary and appends "..." when cut. */
export function clampTitle(title: string, max: number): string {
  const t = title.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "...";
}

/** One line for og:description and the image subtitle. */
export function describeTrace(trace: Trace): string {
  const n = trace.steps.length;
  const parts = [
    `${n} step${n === 1 ? "" : "s"}`,
    `${formatTokens(trace.totals.inputTokens)} tokens in`,
    `${formatTokens(trace.totals.outputTokens)} out`,
    `${trace.totals.toolCalls} tool call${trace.totals.toolCalls === 1 ? "" : "s"}`,
    formatDuration(trace.totals.durationMs),
  ];
  const line = parts.join(", ");
  return trace.model ? `${line} with ${trace.model}` : line;
}

/**
 * Splits the step list into n equal cells and picks the most common kind in
 * each, so a long session compresses into a coloured strip. Ties go to the
 * kind seen first. Empty input yields "system" cells.
 */
export function kindStrip(steps: Pick<Step, "kind">[], n: number): StepKind[] {
  const out: StepKind[] = [];
  if (steps.length === 0) return new Array(n).fill("system");
  for (let c = 0; c < n; c++) {
    const from = Math.floor((c * steps.length) / n);
    const to = Math.max(from + 1, Math.floor(((c + 1) * steps.length) / n));
    const counts = new Map<StepKind, number>();
    for (let i = from; i < to && i < steps.length; i++) counts.set(steps[i].kind, (counts.get(steps[i].kind) ?? 0) + 1);
    let best: StepKind = steps[from].kind;
    let bestN = 0;
    for (const [k, v] of counts) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    out.push(best);
  }
  return out;
}
```

Check `formatDuration(9_900_000)` really yields `2h 45m` (9,900,000 ms = 165 min) and `formatTokens(279_185)` yields `279k`; adjust the test expectations to what `lib/trace/format.ts` produces, not the helper.

- [ ] **Step 3: shared loader**

`lib/share/load.ts`:

```ts
import "server-only";
import { cache } from "react";
import { loadTrace, type StoreClient } from "@/lib/share/store";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";
import type { Trace } from "@/lib/trace/types";

/**
 * Loads a shared trace once per request; the page, its metadata and the OG
 * image all call this. Null when the share is missing, expired or sharing is
 * not configured.
 */
export const loadSharedTrace = cache(async (id: string): Promise<Trace | null> => {
  try {
    // SupabaseClient's generic builder types do not line up with the narrow StoreClient slice.
    return await loadTrace(getAdminClient() as unknown as StoreClient, id);
  } catch (err) {
    if (err instanceof SharingNotConfigured) return null;
    throw err;
  }
});
```

- [ ] **Step 4: share page metadata**

Replace `app/r/[id]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReplay } from "@/components/share/SharedReplay";
import { loadSharedTrace } from "@/lib/share/load";
import { describeTrace } from "@/lib/share/og";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const trace = await loadSharedTrace(id);
  if (!trace) return { title: "Replay not found | Tracecast", robots: { index: false } };
  const title = `${trace.title} | Tracecast`;
  const description = describeTrace(trace);
  return {
    title,
    description,
    // Shared links are unlisted; keep them out of search engines.
    robots: { index: false, follow: false },
    openGraph: { title: trace.title, description, siteName: "Tracecast", type: "website", url: `/r/${id}` },
    twitter: { card: "summary_large_image", title: trace.title, description },
  };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  const trace = await loadSharedTrace(id);
  if (!trace) notFound();
  return <SharedReplay trace={trace} />;
}
```

`app/layout.tsx`: add `metadataBase` so `og:image` and `og:url` are absolute:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Tracecast",
  description: "Turn a Claude Code session into a polished, shareable replay.",
};
```

`.env.example`: append

```
# Public origin used for absolute Open Graph URLs (no trailing slash).
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`README.md` Sharing section: add one sentence: "Set `NEXT_PUBLIC_SITE_URL` to the deployed origin so link previews point at absolute image URLs."

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add lib/share/load.ts lib/share/og.ts lib/share/og.test.ts "app/r/[id]/page.tsx" app/layout.tsx .env.example README.md
git commit -m "feat(embed): shared trace loader, og helpers and share page metadata"
```

---

### Task 2: Open Graph image

**Files:**
- Create: `app/r/[id]/opengraph-image.tsx`

- [ ] **Step 1: image route**

```tsx
import { ImageResponse } from "next/og";
import { loadSharedTrace } from "@/lib/share/load";
import { clampTitle, describeTrace, KIND_COLORS, kindStrip } from "@/lib/share/og";
import { formatDuration, formatTokens } from "@/lib/trace/format";

export const dynamic = "force-dynamic";
export const alt = "Tracecast replay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CELLS = 60;

type Params = { params: Promise<{ id: string }> };

export default async function Image({ params }: Params) {
  const { id } = await params;
  const trace = await loadSharedTrace(id);

  if (!trace) {
    return new ImageResponse(
      (
        <div style={{ ...frame, alignItems: "center", justifyContent: "center", fontSize: 40, color: "#a1a1aa" }}>
          Replay not found
        </div>
      ),
      size
    );
  }

  const chips = [
    trace.model,
    formatDuration(trace.totals.durationMs),
    `${formatTokens(trace.totals.inputTokens)} in`,
    `${formatTokens(trace.totals.outputTokens)} out`,
    `${trace.totals.toolCalls} tool calls`,
  ].filter((c): c is string => Boolean(c));
  const strip = kindStrip(trace.steps, CELLS);

  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: "#d4d4d8" }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#38bdf8" }} />
            Tracecast
          </div>
          <div style={{ fontSize: 22, color: "#71717a" }}>{trace.steps.length} steps</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 56 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#fafafa" }}>{clampTitle(trace.title, 90)}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: "1px solid #27272a",
                  background: "rgba(24,24,27,0.7)",
                  fontSize: 24,
                  color: "#d4d4d8",
                }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto" }}>
          <div style={{ display: "flex", gap: 4, height: 44 }}>
            {strip.map((kind, i) => (
              <div key={i} style={{ flex: 1, borderRadius: 4, background: KIND_COLORS[kind], opacity: kind === "system" ? 0.5 : 0.9 }} />
            ))}
          </div>
          <div style={{ fontSize: 20, color: "#71717a" }}>{describeTrace(trace)}</div>
        </div>
      </div>
    ),
    size
  );
}

const frame: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 64,
  background: "linear-gradient(135deg, #09090b 0%, #111114 100%)",
  color: "#fafafa",
  fontFamily: "sans-serif",
};
```

Notes for the implementer: `next/og` uses Satori, which needs `display: flex` on every element with more than one child (already set above). Do not use Tailwind classes. Keep the default font (no `fonts` option) unless the build complains. If `React.CSSProperties` is not in scope, `import type { CSSProperties } from "react"`.

- [ ] **Step 2: Run, commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/r/[id]/opengraph-image.tsx"
git commit -m "feat(embed): open graph image for shared replays"
```

Visual verification happens in Task 5; there is no unit test for the image route.

---

### Task 3: Compact replay, embed page

**Files:**
- Modify: `components/replay/ReplayView.tsx`, `components/replay/ReplayView.test.tsx`
- Create: `components/embed/EmbedReplay.tsx`, `app/embed/[id]/page.tsx`

- [ ] **Step 1: ReplayView test (failing)**

Append to `components/replay/ReplayView.test.tsx`:

```tsx
  it("starts playing on mount when autoplay is set", async () => {
    render(<ReplayView trace={trace} warnings={[]} autoplay />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy());
  });
```

and add `waitFor` to the testing-library import.

- [ ] **Step 2: ReplayView props**

In `components/replay/ReplayView.tsx`:

```tsx
type Props = { trace: Trace; warnings: string[]; compact?: boolean; autoplay?: boolean };

export function ReplayView({ trace, compact = false, autoplay = false }: Props) {
  const schedule = useMemo(() => buildSchedule(trace.steps), [trace]);
  const totals = useMemo(() => cumulativeTotals(trace.steps), [trace]);
  const rows = useMemo(() => buildTimeline(trace), [trace]);
  const player = usePlayer(schedule);
  useReplayKeys(player);

  // Autoplay after the player's own reset microtask has run.
  const { toggle, playing } = player;
  useEffect(() => {
    if (!autoplay) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !playing) toggle();
    });
    return () => {
      cancelled = true;
    };
    // Run once per schedule; `playing` is read inside the microtask on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, schedule]);

  const visible = useMemo(() => rows.slice(0, visibleCount(rows, player.index)), [rows, player.index]);

  return (
    <div className={`mx-auto w-full max-w-3xl px-6 ${compact ? "pt-2 pb-24" : "pt-4 pb-32"}`}>
      <LiveTotals trace={trace} index={player.index} totals={totals} compact={compact} />
      <Timeline rows={visible} startedAt={trace.startedAt} current={player.index} follow={player.playing} />
      <PlayerBar player={player} />
    </div>
  );
}
```

Add `useEffect` to the react import. If the eslint disable comment is rejected by the config, restructure: keep a `startedRef = useRef(false)` and call `toggle()` inside the microtask only when `!startedRef.current`, setting it true, with deps `[autoplay, schedule, toggle]` (never read `playing`).

`components/replay/LiveTotals.tsx`: accept `compact?: boolean`; when compact, render the title at `text-base` and skip the model chip, otherwise unchanged:

```tsx
export function LiveTotals({ trace, index, totals, compact = false }: { trace: Trace; index: number; totals: CumulativeTotals; compact?: boolean }) {
  ...
      <h1 className={`truncate font-semibold text-zinc-50 ${compact ? "text-base" : "text-lg"}`}>{trace.title}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        {trace.model && !compact && <Chip>{trace.model}</Chip>}
```

- [ ] **Step 3: EmbedReplay and the embed page**

`components/embed/EmbedReplay.tsx`:

```tsx
"use client";

import { ReplayView } from "@/components/replay/ReplayView";
import type { Trace } from "@/lib/trace/types";

export function EmbedReplay({ trace, shareUrl, autoplay }: { trace: Trace; shareUrl: string; autoplay: boolean }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-4">
        <span className="text-xs font-semibold tracking-tight text-zinc-400">Tracecast</span>
        <a href={shareUrl} target="_blank" rel="noopener" className="text-xs text-zinc-500 hover:text-zinc-200">
          Open replay
        </a>
      </div>
      <ReplayView trace={trace} warnings={[]} compact autoplay={autoplay} />
    </>
  );
}
```

`app/embed/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedReplay } from "@/components/embed/EmbedReplay";
import { loadSharedTrace } from "@/lib/share/load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ autoplay?: string }> };

export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ id }, { autoplay }] = await Promise.all([params, searchParams]);
  const trace = await loadSharedTrace(id);
  if (!trace) notFound();
  return <EmbedReplay trace={trace} shareUrl={`/r/${id}`} autoplay={autoplay === "1"} />;
}
```

`generateMetadata` is not needed here; a static `metadata` export with `robots` is enough, plus the page title falls back to the root layout's "Tracecast".

- [ ] **Step 4: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/replay/ReplayView.tsx components/replay/ReplayView.test.tsx components/replay/LiveTotals.tsx components/embed "app/embed/[id]/page.tsx"
git commit -m "feat(embed): compact autoplaying replay at /embed/[id]"
```

---

### Task 4: Embed snippet in the share dialog

**Files:**
- Modify: `components/share/ShareDialog.tsx`, `components/share/ShareDialog.test.tsx`

- [ ] **Step 1: Test (failing)**

Append to the `describe("ShareDialog")` block:

```tsx
  it("offers an iframe snippet next to the link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "AbCdEfGhIjKl", url: "http://x/r/AbCdEfGhIjKl", expiresAt: null }), { status: 201 })));
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByLabelText("Embed code")).toBeTruthy());
    const snippet = (screen.getByLabelText("Embed code") as HTMLTextAreaElement).value;
    expect(snippet).toContain('src="http://x/embed/AbCdEfGhIjKl"');
    expect(snippet).toContain("<iframe");
  });
```

- [ ] **Step 2: Implementation**

In `ShareDialog.tsx` add a pure helper above the component:

```ts
/** Turns a share url into the matching embed url and an iframe snippet. */
export function embedSnippet(shareUrl: string): string {
  const src = shareUrl.replace(/\/r\/([0-9A-Za-z]+)$/, "/embed/$1");
  return `<iframe src="${src}" width="100%" height="560" style="border:0;border-radius:12px;background:#09090b" loading="lazy" allowfullscreen title="Tracecast replay"></iframe>`;
}
```

In the done branch, below the link row, render:

```tsx
            <div className="space-y-1">
              <label htmlFor="embed-code" className="text-xs text-zinc-400">Embed on your site</label>
              <textarea
                id="embed-code"
                aria-label="Embed code"
                readOnly
                rows={3}
                value={embedSnippet(phase.url)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[11px] leading-4 text-zinc-300"
              />
            </div>
```

Note: `aria-label` on the textarea plus a visible label is redundant; keep only the `<label htmlFor>` and change the test to `getByLabelText("Embed on your site")` if the reviewer prefers. Either is acceptable, pick one and keep the test in sync.

- [ ] **Step 3: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/share/ShareDialog.tsx components/share/ShareDialog.test.tsx
git commit -m "feat(embed): iframe snippet in the share dialog"
```

---

### Task 5: Verification

Controller only.

- [ ] **Step 1: Metadata and image.** Dev server up. Open `/r/9AH0pan93naX` (existing share). Read `<head>`: `og:title`, `og:description`, `og:image` (absolute, ends with `/r/9AH0pan93naX/opengraph-image...`), `twitter:card=summary_large_image`, `robots noindex`. Open the `og:image` URL: 1200x630 PNG with title, chips, strip, description line. Screenshot it. Open `/r/nope/opengraph-image`: "Replay not found" image (or 404, both fine).
- [ ] **Step 2: Embed.** Write a scratch HTML file with `<iframe src="http://localhost:<port>/embed/9AH0pan93naX?autoplay=1" width="100%" height="560">` and open it in Playwright via `file://`. The replay plays inside the frame, the bar is pinned to the frame bottom, "Open replay" opens `/r/<id>` in a new tab. Check `/embed/nope` is 404. Mobile width: no horizontal overflow.
- [ ] **Step 3: Dialog.** `/?fixture=short`, Share, Create link, the embed snippet shows and matches the id.
- [ ] **Step 4: Build.** Stop the dev server, `rm -rf .next`, `npm run build` (sandbox off). Routes list includes `/embed/[id]` and `/r/[id]/opengraph-image`.
- [ ] **Step 5: Polish commit, final review, memory update, stop for go-ahead on chunk 6.**

---

## Roadmap notes carried forward

- **Chunk 6 (launch):** landing page with a live demo replay (a curated share id or a bundled fixture), README with GIF, Vercel deploy, set `NEXT_PUBLIC_SITE_URL`, `SUPABASE_*` env on Vercel, rate limit on `POST /api/share`, rotate the service role key, add to the portfolio.
- **Link preview check** on X, Slack and WhatsApp needs a public URL; do it right after the Vercel deploy in chunk 6.
- **Motion-lab swap** still pending; unchanged by this chunk.
