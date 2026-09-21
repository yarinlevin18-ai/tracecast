# Tracecast Chunk 6: Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tracecast: a landing page with a live demo replay, a README with a GIF, a rate limited share route, a public GitHub repo, a Vercel deployment, and a portfolio entry.

**Architecture:** The landing keeps `app/page.tsx` as the state machine (drop a file, see the replay) and renders a new `Landing` component when nothing is loaded. The live demo is a bundled, redacted trace (`lib/demo/trace.json`, generated from the `subagents` fixture by `scripts/make-demo.ts`) served by `app/demo/page.tsx` through the existing `EmbedReplay`, and the landing shows it in an iframe, which also demonstrates the embed feature. The share route gains a Supabase backed per-IP hourly limit. The GIF is recorded from `/demo` with `playwright-core` driving the installed Chrome and converted with ffmpeg.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, `playwright-core` (dev only), ffmpeg (local), GitHub, Vercel.

---

## File structure

- `supabase/migrations/0002_share_events.sql` (new): `public.share_events(ip_hash, created_at)` for rate limiting.
- `lib/share/ratelimit.ts` + test (new): `hashIp`, `SHARE_LIMIT`, `SHARE_WINDOW_MS`, `checkAndRecordShare(client, ipHash, now)`.
- `app/api/share/route.ts` + test (modify): 429 when over the limit; fail open when the limit query errors.
- `scripts/make-demo.ts` (new) and `lib/demo/trace.json` (generated, committed): the demo trace.
- `app/demo/page.tsx` (new): the demo replay, embeddable at `/demo?autoplay=1`.
- `components/embed/EmbedReplay.tsx` (modify): optional `linkLabel`.
- `components/landing/Landing.tsx` + test (new): hero, drop zone, demo iframe, features, footer.
- `lib/site.ts` (new): site name, tagline, GitHub URL.
- `app/page.tsx` (modify): render `Landing` when nothing is loaded.
- `scripts/make-gif.ts` (new), `docs/demo.gif` (generated, committed), `README.md` (rewrite).
- Deploy: GitHub repo, Vercel project with env, portfolio entry (controller, needs Yarin).

---

### Task 1: Rate limit the share route

**Files:**
- Create: `supabase/migrations/0002_share_events.sql`, `lib/share/ratelimit.ts`, `lib/share/ratelimit.test.ts`
- Modify: `app/api/share/route.ts`, `app/api/share/route.test.ts`, `.env.example`, `README.md` (one line in Sharing)

- [ ] **Step 1: migration**

```sql
-- One row per accepted share, keyed by a salted hash of the client IP, so the
-- share route can refuse more than SHARE_LIMIT uploads per hour per network.
create table if not exists public.share_events (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.share_events enable row level security;
-- No policies on purpose: only the service role reads or writes.

create index if not exists share_events_ip_created_idx on public.share_events (ip_hash, created_at);
```

- [ ] **Step 2: ratelimit tests (failing)**

`lib/share/ratelimit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { checkAndRecordShare, hashIp, SHARE_LIMIT, type LimitClient } from "./ratelimit";

function fake(count: number | null, error: { message: string } | null = null) {
  const gte = vi.fn(async () => ({ count, error }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const insert = vi.fn(async () => ({ error: null }));
  const client: LimitClient = { from: () => ({ select, insert }) };
  return { client, select, eq, gte, insert };
}

describe("hashIp", () => {
  it("is stable, salted and does not contain the ip", () => {
    const a = hashIp("203.0.113.9", "salt");
    expect(a).toBe(hashIp("203.0.113.9", "salt"));
    expect(a).not.toBe(hashIp("203.0.113.9", "other"));
    expect(a).not.toContain("203.0.113.9");
    expect(a).toHaveLength(64);
  });
});

describe("checkAndRecordShare", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it("records the share and reports the remaining budget", async () => {
    const f = fake(3);
    const out = await checkAndRecordShare(f.client, "h", now);
    expect(out).toEqual({ allowed: true, remaining: SHARE_LIMIT - 4 });
    expect(f.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(f.eq).toHaveBeenCalledWith("ip_hash", "h");
    expect(f.gte).toHaveBeenCalledWith("created_at", "2026-09-21T11:00:00.000Z");
    expect(f.insert).toHaveBeenCalledWith({ ip_hash: "h" });
  });

  it("refuses without recording once the limit is reached", async () => {
    const f = fake(SHARE_LIMIT);
    expect(await checkAndRecordShare(f.client, "h", now)).toEqual({ allowed: false, remaining: 0 });
    expect(f.insert).not.toHaveBeenCalled();
  });

  it("fails open when the count query errors", async () => {
    const f = fake(null, { message: "down" });
    expect((await checkAndRecordShare(f.client, "h", now)).allowed).toBe(true);
  });
});
```

- [ ] **Step 3: ratelimit implementation**

`lib/share/ratelimit.ts`:

```ts
import { createHash } from "node:crypto";

export const SHARE_LIMIT = 10;
export const SHARE_WINDOW_MS = 60 * 60 * 1000;
const TABLE = "share_events";

/** The slice of the Supabase client the limiter uses, so tests can fake it. */
export type LimitClient = {
  from: (table: string) => {
    select: (cols: string, opts: { count: "exact"; head: true }) => {
      eq: (col: string, value: string) => {
        gte: (col: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

/** Salted sha256 so the table never stores a raw address. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Counts this network's shares in the last hour and records the new one.
 * Fails open: if Supabase cannot answer, sharing still works and the failure
 * is logged, because a broken limiter should not take the product down.
 */
export async function checkAndRecordShare(client: LimitClient, ipHash: string, now: Date = new Date()): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date(now.getTime() - SHARE_WINDOW_MS).toISOString();
  const { count, error } = await client.from(TABLE).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if (error) {
    console.error("share limit lookup failed", error.message);
    return { allowed: true, remaining: SHARE_LIMIT };
  }
  const used = count ?? 0;
  if (used >= SHARE_LIMIT) return { allowed: false, remaining: 0 };
  const ins = await client.from(TABLE).insert({ ip_hash: ipHash });
  if (ins.error) console.error("share limit record failed", ins.error.message);
  return { allowed: true, remaining: SHARE_LIMIT - used - 1 };
}
```

- [ ] **Step 4: route**

In `app/api/share/route.ts`, after validation succeeds and the admin client is obtained, before `uploadTrace`:

```ts
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const limit = await checkAndRecordShare(client as unknown as LimitClient, hashIp(ip, process.env.SHARE_IP_SALT ?? "tracecast"));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many shares from this network. Try again in an hour." }, { status: 429 });
  }
```

Import `checkAndRecordShare`, `hashIp`, `type LimitClient` from `@/lib/share/ratelimit`. Keep the existing `client` variable typed as `StoreClient`; the second cast is fine.

Route tests: mock `@/lib/share/ratelimit` with `vi.hoisted` so `checkAndRecordShare` is a `vi.fn()` defaulting to `{ allowed: true, remaining: 9 }` in `beforeEach` (keep `hashIp` real by spreading the original module). Add: (a) when it resolves `{ allowed: false, remaining: 0 }` the route answers 429 and `uploadTrace` is not called; (b) the limiter receives a hash of the first `x-forwarded-for` address (assert `hashIp("203.0.113.9", "tracecast")` equals the second argument when the request carries `x-forwarded-for: 203.0.113.9, 10.0.0.1`).

`.env.example`: append `# Optional salt for the hashed IPs in share_events.` and `SHARE_IP_SALT=`.
`README.md` Sharing: one sentence: "Apply `0002_share_events.sql` too; the share route allows 10 uploads per hour per network."

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add supabase/migrations/0002_share_events.sql lib/share/ratelimit.ts lib/share/ratelimit.test.ts app/api/share/route.ts app/api/share/route.test.ts .env.example README.md
git commit -m "feat(launch): per network hourly limit on the share route"
```

The controller applies the migration to the hosted project.

---

### Task 2: Demo trace, demo page, landing page

**Files:**
- Create: `scripts/make-demo.ts`, `lib/demo/trace.json` (generated), `app/demo/page.tsx`, `lib/site.ts`, `components/landing/Landing.tsx`, `components/landing/Landing.test.tsx`
- Modify: `components/embed/EmbedReplay.tsx`, `app/page.tsx`, `package.json` (script)

- [ ] **Step 1: demo script**

`scripts/make-demo.ts`:

```ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseClaudeCodeSession } from "../lib/trace/parsers/claude-code";
import { redactTrace } from "../lib/share/redact";

/** Usage: npm run demo [fixtureName]  (default: subagents) */
const name = process.argv[2] ?? "subagents";
const dir = join("fixtures", name);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".jsonl"))
  .sort()
  .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
const { trace, warnings } = parseClaudeCodeSession(files);
const { trace: clean, hits } = redactTrace(trace);
const out = { ...clean, id: "demo" };
writeFileSync(join("lib", "demo", "trace.json"), JSON.stringify(out));
console.log(`wrote lib/demo/trace.json: ${out.steps.length} steps, ${hits.length} redaction hits, ${warnings.length} warnings`);
```

`package.json` scripts: `"demo": "tsx scripts/make-demo.ts"`. Run it with the sandbox off (`npm run demo`), commit the JSON (about 260 KB).

- [ ] **Step 2: site constants and EmbedReplay label**

`lib/site.ts`:

```ts
export const SITE = {
  name: "Tracecast",
  tagline: "Replay your agent runs like a screen recording.",
  description: "Turn a Claude Code session into a polished, animated replay with a shareable link and an embeddable player.",
  github: "https://github.com/yarinlevin18-ai/tracecast",
};
```

`components/embed/EmbedReplay.tsx`: add `linkLabel?: string` (default `"Open replay"`) and render it as the link text.

- [ ] **Step 3: demo page**

`app/demo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EmbedReplay } from "@/components/embed/EmbedReplay";
import demo from "@/lib/demo/trace.json";
import { validateTrace } from "@/lib/share/validate";

export const metadata: Metadata = {
  title: "Demo replay | Tracecast",
  description: "A real Claude Code session, replayed.",
};

// Validated once at module load; a bad file fails the build, not a request.
const trace = validateTrace(demo);

type Props = { searchParams: Promise<{ autoplay?: string | string[] }> };

export default async function DemoPage({ searchParams }: Props) {
  const { autoplay } = await searchParams;
  return <EmbedReplay trace={trace} shareUrl="/" linkLabel="Replay your own session" autoplay={autoplay === "1"} />;
}
```

`tsconfig.json` already has `resolveJsonModule` through Next's defaults; if tsc complains, add `"resolveJsonModule": true`.

- [ ] **Step 4: Landing test (failing)**

`components/landing/Landing.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("shows the pitch, the drop zone and the live demo", () => {
    render(<Landing onFiles={() => {}} error={null} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/replay/i);
    expect(screen.getByTestId("dropzone")).toBeTruthy();
    const frame = screen.getByTitle("Tracecast demo replay") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/demo?autoplay=1");
    expect(screen.getByText(/nothing leaves your browser/i)).toBeTruthy();
  });
});
```

- [ ] **Step 5: Landing**

`components/landing/Landing.tsx`:

```tsx
"use client";

import { Code2, Play, Share2 } from "lucide-react";
import { DropZone } from "@/components/trace/DropZone";
import { SITE } from "@/lib/site";
import type { SessionFile } from "@/lib/trace/types";

type Props = { onFiles: (files: SessionFile[]) => void; error: string | null };

const FEATURES = [
  { Icon: Play, title: "Replay", body: "Long pauses are compressed, every step lands in order, and you can scrub, step and speed up." },
  { Icon: Share2, title: "Share", body: "Review what gets published. Secrets and personal paths are redacted before anything is uploaded. Links can expire." },
  { Icon: Code2, title: "Embed", body: "Drop the player into a blog post or a PR with one iframe. Links unfurl with a preview card." },
];

export function Landing({ onFiles, error }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 pb-24">
      <nav className="flex items-center justify-between py-8">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">{SITE.name}</span>
        <a href={SITE.github} className="text-xs text-zinc-500 hover:text-zinc-200" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </nav>

      <section className="py-12 sm:py-20">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">{SITE.tagline}</h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-400">{SITE.description}</p>
        <p className="mt-2 text-sm text-zinc-500">Parsing runs in your browser. Nothing leaves your browser until you click Share.</p>
        <div className="mt-10">
          <DropZone onFiles={onFiles} error={error} />
        </div>
      </section>

      <section className="py-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Watch a real session</h2>
          <a href="/demo" className="text-xs text-zinc-500 hover:text-zinc-200">Open full size</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
          <iframe src="/demo?autoplay=1" title="Tracecast demo replay" className="h-[560px] w-full" loading="lazy" />
        </div>
      </section>

      <section className="grid gap-6 py-12 sm:grid-cols-3">
        {FEATURES.map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <Icon className="h-5 w-5 text-sky-400" aria-hidden />
            <h3 className="mt-3 font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p>
          </div>
        ))}
      </section>

      <footer className="flex items-center justify-between border-t border-zinc-800 pt-8 text-xs text-zinc-500">
        <span>Built by Yarin Levin</span>
        <a href={SITE.github} className="hover:text-zinc-200" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </footer>
    </main>
  );
}
```

The DropZone already says "Nothing leaves your browser."; the test's `getByText(/nothing leaves your browser/i)` will find two matches and throw. Use `getAllByText(...).length >= 1` in the test instead.

`app/page.tsx`: replace the bottom `<main>` block with `<Landing onFiles={parseFiles} error={error} />` and drop the now unused `DropZone` import. Keep `useFixtureParam`.

- [ ] **Step 6: Run, commit**

```bash
npm run demo   # sandbox off
npm test && npx tsc --noEmit && npm run lint
git add scripts/make-demo.ts lib/demo/trace.json app/demo/page.tsx lib/site.ts components/landing components/embed/EmbedReplay.tsx app/page.tsx package.json
git commit -m "feat(launch): landing page with a live demo replay"
```

---

### Task 3: GIF and README

**Files:**
- Create: `scripts/make-gif.ts`, `docs/demo.gif`
- Modify: `README.md`, `package.json` (devDependency `playwright-core`, script `gif`), `.gitignore` (ignore `docs/demo.webm`)

- [ ] **Step 1: recorder**

`npm i -D playwright-core` (no browser download; it drives the installed Google Chrome). `scripts/make-gif.ts`:

```ts
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright-core";

/**
 * Usage: npm run gif -- http://localhost:3000
 * Records /demo?autoplay=1 for a few seconds with the installed Chrome and
 * converts the video to docs/demo.gif with ffmpeg.
 */
const base = process.argv[2] ?? "http://localhost:3000";
const seconds = Number(process.argv[3] ?? 14);
const outDir = join("docs");
const tmpDir = join(outDir, ".video");
mkdirSync(tmpDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 960, height: 600 },
  deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width: 960, height: 600 } },
  colorScheme: "dark",
});
const page = await context.newPage();
await page.goto(`${base}/demo?autoplay=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(seconds * 1000);
await context.close();
await browser.close();

const webm = readdirSync(tmpDir).find((f) => f.endsWith(".webm"));
if (!webm) throw new Error("no video recorded");
const video = join(outDir, "demo.webm");
renameSync(join(tmpDir, webm), video);
execFileSync("ffmpeg", [
  "-y", "-i", video,
  "-vf", "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
  "-loop", "0",
  join(outDir, "demo.gif"),
], { stdio: "inherit" });
console.log("wrote docs/demo.gif");
```

`package.json`: `"gif": "tsx scripts/make-gif.ts"`. `.gitignore`: add `docs/demo.webm` and `docs/.video/`. Run with the dev server up and the sandbox off. Check the GIF is under 5 MB; if larger, lower `fps` to 10 or `scale` to 720.

- [ ] **Step 2: README**

Rewrite `README.md`:

```markdown
# Tracecast

Replay your agent runs like a screen recording.

Drop a Claude Code session file and get a polished, animated replay with a
shareable link and an embeddable player. Think Loom for agent runs.

![Tracecast replaying a Claude Code session](docs/demo.gif)

**Live:** https://tracecast.vercel.app (demo at /demo)

## What it does

- **Replay.** Long pauses are compressed, every step lands in order, tool calls
  resolve as their results arrive. Scrub, step, play at 1x, 2x or 4x.
- **Share.** A redaction review flags API keys, tokens, emails and home
  directory paths before anything is uploaded. Edit or drop steps, pick an
  expiry, get a link.
- **Embed.** One iframe drops the player into a blog post or a PR. Links
  unfurl with a preview card showing title, model, totals and a mini timeline.

Parsing runs in your browser. Nothing leaves it until you click Share.

## How it works

Session files (`~/.claude/projects/<project>/<session>.jsonl`, plus any
`agent-*.jsonl` subagent files) are parsed client side into a normalized
`Trace`. Sharing uploads that normalized JSON, not the raw file, to Supabase
Storage behind a service role key that never reaches the browser.

## Dev

    npm install
    npm run dev          # http://localhost:3000  (dev: /?fixture=long)
    npm test

Replay: space plays, arrows step, 1/2/4 set speed.

## Fixtures and the demo

Fixtures are real sessions, stripped and redacted with
`npm run fixture -- <session.jsonl> <name>`. Review the output before
committing. `npm run demo` rebuilds `lib/demo/trace.json` from the
`subagents` fixture; `npm run gif -- http://localhost:3000` re-records
`docs/demo.gif` (needs Google Chrome and ffmpeg).

## Sharing

Share links need a Supabase project. Apply the migrations in
`supabase/migrations` (dashboard SQL editor, or `supabase link` then
`supabase db push`), copy `.env.example` to `.env.local` and fill in the URL
and service role key. Without them the app works but the Share button reports
that sharing is not configured. The share route allows 10 uploads per hour per
network. Set `NEXT_PUBLIC_SITE_URL` to the deployed origin so link previews use
absolute image URLs.

## Deploy

Vercel, framework preset Next.js, with `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` set for Production.
```

Replace the live URL with the real one once deployed.

- [ ] **Step 3: Commit**

```bash
git add scripts/make-gif.ts docs/demo.gif README.md package.json package-lock.json .gitignore
git commit -m "docs(launch): readme with demo gif"
```

---

### Task 4: Repo, deploy, portfolio (controller, with Yarin)

- [ ] Create the public GitHub repo `yarinlevin18-ai/tracecast`, push `main`.
- [ ] Vercel project from the repo, env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SHARE_IP_SALT`; production deploy; apply migration 0002.
- [ ] Smoke the deployment: `/`, `/demo`, share a fixture, open the link in a fresh browser, `/r/<id>/opengraph-image`, embed snippet, 429 after 10 shares (optional).
- [ ] Rotate the Supabase service role key (Yarin), update Vercel env.
- [ ] Portfolio "latest works" entry: needs the portfolio location from Yarin.
- [ ] Update `SITE.github` and the README live URL if the names differ; final review; memory; stop.

---

## Roadmap notes carried forward

- Later (not v1): OpenTelemetry GenAI import, MP4/GIF export, run compare view.
- Expired rows cleanup job (Supabase cron) still not needed for v1.
- Motion-lab swap still pending.
