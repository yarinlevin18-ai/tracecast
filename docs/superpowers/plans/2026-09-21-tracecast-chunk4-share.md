# Tracecast Chunk 4: Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Share button that runs a redaction pass over the parsed Trace (auto-flagging secrets and absolute paths, letting the user edit or remove steps), uploads the normalized Trace JSON to Supabase Storage with a row in a `traces` table, and serves a public replay at `/r/[id]` that opens in a fresh browser with no login. Optional expiry.

**Architecture:** Nothing leaves the browser until the user clicks "Create link". The browser never holds a Supabase key: it POSTs the redacted Trace to a Next.js route handler (`/api/share`) which validates it, generates an id, uploads to a private Storage bucket and inserts the row using the service role key from server env. `/r/[id]` is a server component that loads the row and the JSON with the same server client and renders the existing `ReplayView`. Pure logic (redaction over a Trace, step removal and re-indexing, validation, id generation, the storage operations with an injected client) lives in `lib/share/` with node tests; React parts live in `components/share/`.

**Tech Stack:** Next.js 16 route handlers and server components, `@supabase/supabase-js` v2 (server side only), Supabase Postgres plus Storage, existing `lib/trace/secrets.ts` patterns, Vitest 5.

**Repo facts:** `/Users/yarin/Projects/tracecast`, npm, commits straight to `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Chunks 1 to 3 delivered the parser, `Trace`/`Step` types in `lib/trace/types.ts`, `SECRET_PATTERNS` and `redactText` in `lib/trace/secrets.ts`, the static timeline, and the replay (`components/replay/ReplayView.tsx` takes `{ trace, warnings }`; `components/trace/TopBar.tsx` takes `{ mode, onMode, onReset }`; `app/page.tsx` holds `result` and `mode`). Style rule: no em dashes in code, comments or copy. Run `npm test`, `npx tsc --noEmit`, `npm run lint` plainly. `npm install` and `npm run build` need the sandbox disabled. Vitest: `globals: true`, jsdom via `// @vitest-environment jsdom` docblock, alias `@` = repo root.

**Environment:** server env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (gitignored). When they are missing, `/api/share` answers 503 with a clear message and the Share dialog shows it; the rest of the app keeps working. The Supabase project is not set up on this Mac yet; the schema lives in `supabase/migrations/0001_traces.sql` and is applied once by Yarin (dashboard SQL editor or `supabase db push`).

**Design language:** as before. The Share dialog is a `fixed inset-0` overlay with `bg-black/60 backdrop-blur-sm`, a `max-w-xl` panel `bg-zinc-950 border border-zinc-800 rounded-2xl`, sections separated by `border-zinc-800`, primary button `bg-zinc-100 text-zinc-900`, danger text `text-red-300`. Flagged rows use the amber accent.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0001_traces.sql` | `traces` table, RLS on with no policies, private `traces` bucket |
| `.env.example` | documents the two server vars |
| `lib/supabase/admin.ts` | `getAdminClient()` from env, throws `SharingNotConfigured` when unset |
| `lib/share/id.ts` | `makeId()` 12 chars base62 from `crypto.getRandomValues` |
| `lib/share/validate.ts` | `validateTrace(unknown)` -> `Trace` or throws `ValidationError`; size cap |
| `lib/share/redact.ts` | `redactTrace(trace)` -> `{ trace, hits }`; walks text, tool input strings, result output |
| `lib/share/edit.ts` | `removeSteps(trace, ids)`, `editStepText(trace, id, field, text)` with re-index and totals |
| `lib/share/store.ts` | `uploadTrace(client, trace, opts)`, `loadTrace(client, id)`; client injected |
| `lib/trace/secrets.ts` | add generic home directory patterns (`/Users/<any>`, `/home/<any>`, `C:\Users\<any>`) |
| `app/api/share/route.ts` | POST handler: validate, upload, respond `{ id, url }` |
| `app/r/[id]/page.tsx` | server component: load, 404 when missing or expired, render `SharedReplay` |
| `components/share/SharedReplay.tsx` | client: minimal top bar plus `ReplayView` |
| `components/share/ShareDialog.tsx` | redaction review, expiry, create link, copy |
| `components/trace/TopBar.tsx` | optional `onShare` |
| `app/page.tsx` | opens the dialog |

---

### Task 1: SDK, schema, admin client, env docs

**Files:**
- Modify: `package.json` (via npm; the controller may have installed already, check `node_modules/@supabase/supabase-js`)
- Create: `supabase/migrations/0001_traces.sql`
- Create: `.env.example`
- Create: `lib/supabase/admin.ts`, `lib/supabase/admin.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Install (sandbox disabled, skip if present)**

```bash
cd /Users/yarin/Projects/tracecast && npm install @supabase/supabase-js
```

- [ ] **Step 2: Migration**

`supabase/migrations/0001_traces.sql`:

```sql
-- Shared traces. Rows are written and read only through the service role
-- from Next.js route handlers and server components; no client access.
create table if not exists public.traces (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  totals jsonb not null,
  storage_path text not null,
  expires_at timestamptz
);

alter table public.traces enable row level security;
-- No policies on purpose: anon and authenticated roles get nothing.

create index if not exists traces_expires_at_idx on public.traces (expires_at);

-- Private bucket for the normalized Trace JSON files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('traces', 'traces', false, 10485760, array['application/json'])
on conflict (id) do nothing;
```

- [ ] **Step 3: Env example**

`.env.example`:

```
# Server only. Never expose the service role key to the browser.
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

- [ ] **Step 4: Admin client test (failing)**

`lib/supabase/admin.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getAdminClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws SharingNotConfigured when env is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { getAdminClient, SharingNotConfigured } = await import("./admin");
    expect(() => getAdminClient()).toThrow(SharingNotConfigured);
  });

  it("builds a client when both vars are set", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const { getAdminClient } = await import("./admin");
    const client = getAdminClient();
    expect(typeof client.from).toBe("function");
    expect(typeof client.storage.from).toBe("function");
  });
});
```

- [ ] **Step 5: Admin client**

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SharingNotConfigured extends Error {
  constructor() {
    super("Sharing is not configured on this server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).");
    this.name = "SharingNotConfigured";
  }
}

let cached: SupabaseClient | null = null;

/** Service role client for route handlers and server components only. */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SharingNotConfigured();
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
```

`import "server-only"` makes Next fail the build if this file is ever imported from a client component. In Vitest it must be stubbed: add to `vitest.config.mts` `resolve.alias` an entry `"server-only": import.meta.dirname + "/lib/test/server-only.ts"` and create `lib/test/server-only.ts` containing only `export {};`. Note `vi.resetModules()` in the test so the cached client does not leak between cases.

- [ ] **Step 6: README**

Add a `## Sharing` section:

```md
## Sharing

Share links need a Supabase project. Apply `supabase/migrations/0001_traces.sql`
(dashboard SQL editor, or `supabase link` then `supabase db push`), then copy
`.env.example` to `.env.local` and fill in the URL and service role key. Without
them the app works but the Share button reports that sharing is not configured.
```

- [ ] **Step 7: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add package.json package-lock.json supabase .env.example lib/supabase lib/test vitest.config.mts README.md
git commit -m "feat(share): supabase schema, admin client and env docs"
```

---

### Task 2: Ids and validation

**Files:**
- Create: `lib/share/id.ts`, `lib/share/id.test.ts`
- Create: `lib/share/validate.ts`, `lib/share/validate.test.ts`

- [ ] **Step 1: Tests (failing)**

`lib/share/id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ID_LENGTH, isValidId, makeId } from "./id";

describe("makeId", () => {
  it("makes url safe ids of the fixed length", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toHaveLength(ID_LENGTH);
      expect(id).toMatch(/^[0-9A-Za-z]+$/);
    }
  });
  it("validates ids", () => {
    expect(isValidId(makeId())).toBe(true);
    expect(isValidId("short")).toBe(false);
    expect(isValidId("../../etc/passwd")).toBe(false);
    expect(isValidId("a".repeat(ID_LENGTH))).toBe(true);
  });
});
```

`lib/share/validate.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseClaudeCode } from "@/lib/trace/parsers/claude-code";
import { MAX_TRACE_BYTES, ValidationError, validateTrace } from "./validate";

const real = parseClaudeCode(readFileSync("fixtures/short/main.jsonl", "utf8")).trace;

describe("validateTrace", () => {
  it("accepts a parsed fixture unchanged", () => {
    expect(validateTrace(JSON.parse(JSON.stringify(real)))).toEqual(real);
  });

  it("rejects non objects and missing fields", () => {
    expect(() => validateTrace(null)).toThrow(ValidationError);
    expect(() => validateTrace("x")).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, steps: "nope" })).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, title: 5 })).toThrow(ValidationError);
    expect(() => validateTrace({ ...real, totals: null })).toThrow(ValidationError);
  });

  it("rejects bad steps and duplicate ids", () => {
    expect(() => validateTrace({ ...real, steps: [{ id: "a" }] })).toThrow(ValidationError);
    const dup = { ...real, steps: [real.steps[0], { ...real.steps[1], id: real.steps[0].id }] };
    expect(() => validateTrace(dup)).toThrow(/duplicate/);
    const badKind = { ...real, steps: [{ ...real.steps[0], kind: "alien" }] };
    expect(() => validateTrace(badKind)).toThrow(/kind/);
  });

  it("requires contiguous indexes", () => {
    const gap = { ...real, steps: real.steps.map((s, i) => ({ ...s, index: i === 3 ? 99 : i })) };
    expect(() => validateTrace(gap)).toThrow(/index/);
  });

  it("rejects payloads over the size cap", () => {
    const huge = { ...real, steps: [{ ...real.steps[0], text: "x".repeat(MAX_TRACE_BYTES) }] };
    expect(() => validateTrace(huge)).toThrow(/too large/);
  });

  it("strips unknown top level and step fields", () => {
    const extra = { ...real, evil: 1, steps: [{ ...real.steps[0], evil: 2 }, ...real.steps.slice(1)] };
    const out = validateTrace(extra) as unknown as Record<string, unknown>;
    expect(out.evil).toBeUndefined();
    expect((out.steps as Record<string, unknown>[])[0].evil).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implementation**

`lib/share/id.ts`:

```ts
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const ID_LENGTH = 12;

/** Random, url safe, unguessable enough for unlisted links (62^12). */
export function makeId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function isValidId(id: string): boolean {
  return new RegExp(`^[0-9A-Za-z]{${ID_LENGTH}}$`).test(id);
}
```

(`b % 62` has a slight bias; acceptable for unlisted ids, not for security tokens. Say so in a comment.)

`lib/share/validate.ts`:

```ts
import type { Step, StepKind, Trace } from "@/lib/trace/types";

export const MAX_TRACE_BYTES = 5 * 1024 * 1024;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const KINDS: StepKind[] = ["user", "assistant", "thinking", "tool_call", "tool_result", "subagent", "system"];

function fail(msg: string): never {
  throw new ValidationError(msg);
}
function str(v: unknown, what: string): string {
  if (typeof v !== "string") fail(`${what} must be a string`);
  return v;
}
function optStr(v: unknown, what: string): string | undefined {
  return v === undefined ? undefined : str(v, what);
}
function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}
function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${what} must be an object`);
  return v as Record<string, unknown>;
}

function step(raw: unknown, i: number): Step {
  const s = obj(raw, `steps[${i}]`);
  const kind = str(s.kind, `steps[${i}].kind`);
  if (!KINDS.includes(kind as StepKind)) fail(`steps[${i}].kind is not a known kind`);
  const out: Step = {
    id: str(s.id, `steps[${i}].id`),
    index: num(s.index, `steps[${i}].index`),
    at: str(s.at, `steps[${i}].at`),
    kind: kind as StepKind,
    agent: str(s.agent, `steps[${i}].agent`),
  };
  if (s.parentId !== undefined) out.parentId = str(s.parentId, `steps[${i}].parentId`);
  if (s.durationMs !== undefined) out.durationMs = num(s.durationMs, `steps[${i}].durationMs`);
  if (s.text !== undefined) out.text = str(s.text, `steps[${i}].text`);
  if (s.tool !== undefined) {
    const t = obj(s.tool, `steps[${i}].tool`);
    out.tool = { name: str(t.name, `steps[${i}].tool.name`), input: t.input, callId: str(t.callId, `steps[${i}].tool.callId`) };
  }
  if (s.result !== undefined) {
    const r = obj(s.result, `steps[${i}].result`);
    out.result = {
      callId: str(r.callId, `steps[${i}].result.callId`),
      output: str(r.output, `steps[${i}].result.output`),
      isError: r.isError === true,
    };
  }
  if (s.tokens !== undefined) {
    const t = obj(s.tokens, `steps[${i}].tokens`);
    out.tokens = { input: num(t.input, `steps[${i}].tokens.input`), output: num(t.output, `steps[${i}].tokens.output`) };
  }
  return out;
}

/** Checks shape and size, returns a clean copy with only known fields. */
export function validateTrace(raw: unknown): Trace {
  const t = obj(raw, "trace");
  const source = str(t.source, "source");
  if (source !== "claude-code" && source !== "otel") fail("source is not supported");
  const totals = obj(t.totals, "totals");
  if (!Array.isArray(t.steps)) fail("steps must be an array");
  const steps = t.steps.map(step);
  const ids = new Set<string>();
  steps.forEach((s, i) => {
    if (ids.has(s.id)) fail(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (s.index !== i) fail(`steps[${i}].index must equal its position`);
  });
  const trace: Trace = {
    id: str(t.id, "id"),
    source,
    title: str(t.title, "title"),
    startedAt: str(t.startedAt, "startedAt"),
    endedAt: str(t.endedAt, "endedAt"),
    totals: {
      inputTokens: num(totals.inputTokens, "totals.inputTokens"),
      outputTokens: num(totals.outputTokens, "totals.outputTokens"),
      toolCalls: num(totals.toolCalls, "totals.toolCalls"),
      durationMs: num(totals.durationMs, "totals.durationMs"),
    },
    steps,
  };
  const model = optStr(t.model, "model");
  if (model !== undefined) trace.model = model;
  const bytes = new TextEncoder().encode(JSON.stringify(trace)).length;
  if (bytes > MAX_TRACE_BYTES) fail(`trace is too large (${bytes} bytes, max ${MAX_TRACE_BYTES})`);
  return trace;
}
```

`toEqual(real)` in the first test works because the parser never sets undefined-valued keys; if it does for some field, adjust the test to compare `JSON.parse(JSON.stringify(...))` on both sides and report it.

- [ ] **Step 3: Run, commit**

```bash
git add lib/share/id.ts lib/share/id.test.ts lib/share/validate.ts lib/share/validate.test.ts
git commit -m "feat(share): ids and trace validation"
```

---

### Task 3: Redaction over a Trace, step editing

**Files:**
- Modify: `lib/trace/secrets.ts`, `lib/trace/secrets.test.ts`
- Create: `lib/share/redact.ts`, `lib/share/redact.test.ts`
- Create: `lib/share/edit.ts`, `lib/share/edit.test.ts`

- [ ] **Step 1: Generic home directory patterns**

In `lib/trace/secrets.ts`, after the three existing home patterns add:

```ts
  { name: "home-dir-any", pattern: /\/Users\/(?!dev\b)[^\s/\\"']+/g, replacement: "/Users/dev" },
  { name: "home-dir-linux", pattern: /\/home\/(?!dev\b)[^\s/\\"']+/g, replacement: "/home/dev" },
  { name: "windows-home-any", pattern: /([A-Za-z]):\\Users\\(?!dev\b)[^\s\\/"']+/g, replacement: "$1:\\Users\\dev" },
```

Add to `lib/trace/secrets.test.ts`:

```ts
  it("rewrites any home directory, not only the fixture owner's", () => {
    expect(redactText("/Users/alice/Projects/x and /home/bob/y and C:\\Users\\Carol\\z")).toBe(
      "/Users/dev/Projects/x and /home/dev/y and C:\\Users\\dev\\z"
    );
    expect(redactText("/Users/dev/already")).toBe("/Users/dev/already");
  });
```

Also export a helper used by the dialog to name what matched:

```ts
/** Names of the patterns that would change this text. */
export function matchedPatterns(text: string): string[] {
  return SECRET_PATTERNS.filter((p) => new RegExp(p.pattern.source, p.pattern.flags).test(text)).map((p) => p.name);
}
```

(A fresh RegExp per test avoids `lastIndex` state on the shared `/g` patterns.) Test: `matchedPatterns("sk-abcdefghijklmnopqrstuvwxyz and /Users/x/y")` contains `"anthropic/openai"` and `"home-dir-any"`; `matchedPatterns("plain")` is `[]`.

- [ ] **Step 2: redact tests (failing)**

`lib/share/redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redactTrace } from "./redact";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });
const trace = (steps: Step[]): Trace => ({
  id: "t",
  source: "claude-code",
  title: "Set OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz please",
  startedAt: T,
  endedAt: T,
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: steps.map((s, index) => ({ ...s, index })),
});

describe("redactTrace", () => {
  it("redacts text, tool input strings and outputs, and reports hits per step", () => {
    const { trace: out, hits } = redactTrace(
      trace([
        step({ id: "u", kind: "user", text: "my key is sk-abcdefghijklmnopqrstuvwxyz" }),
        step({ id: "c", kind: "tool_call", tool: { name: "Bash", input: { command: "cat /Users/alice/.env", nested: { token: "ghp_abcdefghijklmnopqrstuvwxyz" } }, callId: "1" } }),
        step({ id: "r", kind: "tool_result", result: { callId: "1", output: "AWS_SECRET=abc123 done", isError: false } }),
        step({ id: "ok", kind: "assistant", text: "nothing secret here" }),
      ])
    );
    expect(out.title).toBe("Set OPENAI_API_KEY=REDACTED please");
    expect(out.steps[0].text).toBe("my key is sk-REDACTED");
    expect((out.steps[1].tool!.input as { command: string; nested: { token: string } }).command).toBe("cat /Users/dev/.env");
    expect((out.steps[1].tool!.input as { nested: { token: string } }).nested.token).toBe("gh_REDACTED");
    expect(out.steps[2].result!.output).toBe("AWS_SECRET=REDACTED done");
    expect(out.steps[3].text).toBe("nothing secret here");
    expect(hits.map((h) => h.stepId)).toEqual(["u", "c", "r"]);
    expect(hits[1].patterns).toEqual(expect.arrayContaining(["home-dir-any", "github"]));
    expect(hits[1].fields).toEqual(["tool.input"]);
  });

  it("does not mutate the input and leaves non string input values alone", () => {
    const original = trace([step({ id: "c", kind: "tool_call", tool: { name: "X", input: { n: 3, list: ["sk-abcdefghijklmnopqrstuvwxyz", 4] }, callId: "1" } })]);
    const copy = JSON.parse(JSON.stringify(original));
    const { trace: out } = redactTrace(original);
    expect(original).toEqual(copy);
    expect((out.steps[0].tool!.input as { n: number; list: unknown[] }).n).toBe(3);
    expect((out.steps[0].tool!.input as { list: unknown[] }).list).toEqual(["sk-REDACTED", 4]);
  });

  it("returns no hits for a clean trace", () => {
    expect(redactTrace(trace([step({ id: "u", kind: "user", text: "hello" })])).hits).toEqual([]);
  });
});
```

- [ ] **Step 3: redact implementation**

`lib/share/redact.ts`:

```ts
import { matchedPatterns, redactText } from "@/lib/trace/secrets";
import type { Step, Trace } from "@/lib/trace/types";

export type RedactionField = "text" | "tool.input" | "result.output";

export type RedactionHit = {
  stepId: string;
  index: number;
  fields: RedactionField[];
  /** Names from SECRET_PATTERNS that matched anywhere in the step. */
  patterns: string[];
};

function redactDeep(value: unknown, matched: Set<string>): unknown {
  if (typeof value === "string") {
    for (const name of matchedPatterns(value)) matched.add(name);
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, matched));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, matched);
    return out;
  }
  return value;
}

function redactStep(step: Step): { step: Step; hit?: RedactionHit } {
  const fields: RedactionField[] = [];
  const patterns = new Set<string>();
  const out: Step = { ...step };

  if (step.text !== undefined) {
    const names = matchedPatterns(step.text);
    if (names.length) {
      fields.push("text");
      names.forEach((n) => patterns.add(n));
      out.text = redactText(step.text);
    }
  }
  if (step.tool) {
    const matched = new Set<string>();
    const input = redactDeep(step.tool.input, matched);
    if (matched.size) {
      fields.push("tool.input");
      matched.forEach((n) => patterns.add(n));
    }
    out.tool = { ...step.tool, input };
  }
  if (step.result) {
    const names = matchedPatterns(step.result.output);
    if (names.length) {
      fields.push("result.output");
      names.forEach((n) => patterns.add(n));
    }
    out.result = { ...step.result, output: names.length ? redactText(step.result.output) : step.result.output };
  }
  return fields.length ? { step: out, hit: { stepId: step.id, index: step.index, fields, patterns: [...patterns] } } : { step: out };
}

/** Applies every secret and path pattern to a Trace, returning a new Trace and the steps that changed. */
export function redactTrace(trace: Trace): { trace: Trace; hits: RedactionHit[] } {
  const hits: RedactionHit[] = [];
  const steps = trace.steps.map((s) => {
    const r = redactStep(s);
    if (r.hit) hits.push(r.hit);
    return r.step;
  });
  return { trace: { ...trace, title: redactText(trace.title), steps }, hits };
}
```

- [ ] **Step 4: edit tests (failing)**

`lib/share/edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { editStepText, removeSteps } from "./edit";
import type { Step, Trace } from "@/lib/trace/types";

const at = (s: number) => new Date(Date.UTC(2026, 8, 21, 10, 0, s)).toISOString();
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: at(0), agent: "main", ...p });
const trace = (steps: Step[]): Trace => ({
  id: "t",
  source: "claude-code",
  title: "t",
  startedAt: at(0),
  endedAt: at(30),
  totals: { inputTokens: 100, outputTokens: 10, toolCalls: 1, durationMs: 30000 },
  steps: steps.map((s, index) => ({ ...s, index })),
});

const base = trace([
  step({ id: "a", kind: "user", at: at(0), durationMs: 10000, text: "hi" }),
  step({ id: "b", kind: "tool_call", at: at(10), durationMs: 10000, tool: { name: "Read", input: {}, callId: "c" } }),
  step({ id: "c", kind: "tool_result", at: at(20), durationMs: 10000, result: { callId: "c", output: "x", isError: false } }),
  step({ id: "d", kind: "assistant", at: at(30), durationMs: 0, text: "bye", tokens: { input: 100, output: 10 } }),
]);

describe("removeSteps", () => {
  it("drops steps, re-indexes, folds the gap into the previous step and recomputes totals", () => {
    const out = removeSteps(base, new Set(["b", "c"]));
    expect(out.steps.map((s) => [s.id, s.index, s.durationMs])).toEqual([
      ["a", 0, 30000],
      ["d", 1, 0],
    ]);
    expect(out.totals).toEqual({ inputTokens: 100, outputTokens: 10, toolCalls: 0, durationMs: 30000 });
    expect(out.startedAt).toBe(at(0));
    expect(out.endedAt).toBe(at(30));
    expect(base.steps).toHaveLength(4);
  });

  it("removing the first step moves startedAt", () => {
    const out = removeSteps(base, new Set(["a"]));
    expect(out.startedAt).toBe(at(10));
    expect(out.totals.durationMs).toBe(20000);
    expect(out.steps[0].durationMs).toBe(10000);
  });

  it("removing everything yields an empty trace", () => {
    const out = removeSteps(base, new Set(["a", "b", "c", "d"]));
    expect(out.steps).toEqual([]);
    expect(out.totals.durationMs).toBe(0);
  });
});

describe("editStepText", () => {
  it("replaces text or output on one step without touching others", () => {
    const out = editStepText(base, "a", "text", "hello");
    expect(out.steps[0].text).toBe("hello");
    expect(out.steps[3].text).toBe("bye");
    const out2 = editStepText(base, "c", "result.output", "y");
    expect(out2.steps[2].result?.output).toBe("y");
    expect(editStepText(base, "zzz", "text", "no")).toBe(base);
  });
});
```

- [ ] **Step 5: edit implementation**

`lib/share/edit.ts`:

```ts
import type { Step, Trace } from "@/lib/trace/types";

/** Recomputes index, gaps, start and end, and totals after steps change. */
function normalize(trace: Trace, steps: Step[]): Trace {
  const out: Step[] = steps.map((s, index) => ({ ...s, index }));
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].durationMs = next ? Math.max(0, Date.parse(next.at) - Date.parse(out[i].at)) : 0;
  }
  const startedAt = out[0]?.at ?? trace.startedAt;
  const endedAt = out[out.length - 1]?.at ?? trace.endedAt;
  const totals = out.reduce(
    (acc, s) => {
      acc.inputTokens += s.tokens?.input ?? 0;
      acc.outputTokens += s.tokens?.output ?? 0;
      if (s.kind === "tool_call") acc.toolCalls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: out.length ? Date.parse(endedAt) - Date.parse(startedAt) : 0 }
  );
  return { ...trace, startedAt, endedAt, totals, steps: out };
}

export function removeSteps(trace: Trace, ids: Set<string>): Trace {
  if (ids.size === 0) return trace;
  return normalize(trace, trace.steps.filter((s) => !ids.has(s.id)));
}

export type EditableField = "text" | "result.output";

export function editStepText(trace: Trace, id: string, field: EditableField, value: string): Trace {
  const i = trace.steps.findIndex((s) => s.id === id);
  if (i < 0) return trace;
  const s = trace.steps[i];
  const edited: Step =
    field === "text" ? { ...s, text: value } : s.result ? { ...s, result: { ...s.result, output: value } } : s;
  if (edited === s) return trace;
  const steps = trace.steps.slice();
  steps[i] = edited;
  return { ...trace, steps };
}
```

Note `normalize` recomputes each `durationMs` from timestamps, which is why removing b and c gives a 30000 ms gap on a.

- [ ] **Step 6: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add lib/trace/secrets.ts lib/trace/secrets.test.ts lib/share/redact.ts lib/share/redact.test.ts lib/share/edit.ts lib/share/edit.test.ts
git commit -m "feat(share): trace redaction with hits, step removal and editing"
```

---

### Task 4: Store and the share route

**Files:**
- Create: `lib/share/store.ts`, `lib/share/store.test.ts`
- Create: `app/api/share/route.ts`, `app/api/share/route.test.ts`

- [ ] **Step 1: store tests (failing)**

`lib/share/store.test.ts` uses a tiny fake with the subset of the Supabase client the store calls:

```ts
import { describe, expect, it, vi } from "vitest";
import { loadTrace, uploadTrace, type StoreClient } from "./store";
import type { Trace } from "@/lib/trace/types";

const trace: Trace = {
  id: "sess",
  source: "claude-code",
  title: "Hello",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:01:00.000Z",
  totals: { inputTokens: 1, outputTokens: 2, toolCalls: 3, durationMs: 60000 },
  steps: [],
};

function fake(row: Record<string, unknown> | null = null, file: string | null = null) {
  const upload = vi.fn(async () => ({ error: null }));
  const download = vi.fn(async () => (file === null ? { data: null, error: { message: "missing" } } : { data: new Blob([file]), error: null }));
  const insert = vi.fn(async () => ({ error: null }));
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const client: StoreClient = {
    storage: { from: () => ({ upload, download }) },
    from: () => ({ insert, select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
  return { client, upload, download, insert, maybeSingle };
}

describe("uploadTrace", () => {
  it("uploads the json and inserts a row with expiry", async () => {
    const f = fake();
    const now = new Date("2026-09-21T12:00:00.000Z");
    const out = await uploadTrace(f.client, trace, { expiresInDays: 7, now, id: "AbCdEfGhIjKl" });
    expect(out.id).toBe("AbCdEfGhIjKl");
    expect(f.upload).toHaveBeenCalledWith("AbCdEfGhIjKl.json", JSON.stringify(trace), { contentType: "application/json", upsert: false });
    expect(f.insert).toHaveBeenCalledWith({
      id: "AbCdEfGhIjKl",
      title: "Hello",
      totals: trace.totals,
      storage_path: "AbCdEfGhIjKl.json",
      expires_at: "2026-09-28T12:00:00.000Z",
    });
  });

  it("stores null expiry when not requested", async () => {
    const f = fake();
    await uploadTrace(f.client, trace, { expiresInDays: null, id: "AbCdEfGhIjKl" });
    expect(f.insert.mock.calls[0][0]).toMatchObject({ expires_at: null });
  });

  it("throws when the upload fails", async () => {
    const f = fake();
    f.upload.mockResolvedValueOnce({ error: { message: "boom" } } as never);
    await expect(uploadTrace(f.client, trace, { expiresInDays: null })).rejects.toThrow(/boom/);
  });
});

describe("loadTrace", () => {
  it("returns null for a missing row or an expired one", async () => {
    expect(await loadTrace(fake().client, "AbCdEfGhIjKl")).toBeNull();
    const expired = fake({ id: "x", storage_path: "x.json", expires_at: "2020-01-01T00:00:00.000Z" }, JSON.stringify(trace));
    expect(await loadTrace(expired.client, "AbCdEfGhIjKl")).toBeNull();
  });

  it("returns the parsed trace when live", async () => {
    const f = fake({ id: "x", storage_path: "x.json", expires_at: null }, JSON.stringify(trace));
    const out = await loadTrace(f.client, "AbCdEfGhIjKl");
    expect(out?.title).toBe("Hello");
    expect(f.download).toHaveBeenCalledWith("x.json");
  });

  it("rejects malformed ids without touching the client", async () => {
    const f = fake();
    expect(await loadTrace(f.client, "../x")).toBeNull();
    expect(f.maybeSingle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: store implementation**

`lib/share/store.ts`:

```ts
import type { Trace } from "@/lib/trace/types";
import { isValidId, makeId } from "./id";
import { validateTrace } from "./validate";

export const BUCKET = "traces";
export const TABLE = "traces";

/** The slice of the Supabase client the store uses, so tests can fake it. */
export type StoreClient = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: string, opts: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>;
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
    };
  };
};

export type UploadOptions = { expiresInDays: number | null; now?: Date; id?: string };

export async function uploadTrace(client: StoreClient, trace: Trace, opts: UploadOptions): Promise<{ id: string; expiresAt: string | null }> {
  const id = opts.id ?? makeId();
  const now = opts.now ?? new Date();
  const expiresAt = opts.expiresInDays ? new Date(now.getTime() + opts.expiresInDays * 86_400_000).toISOString() : null;
  const path = `${id}.json`;

  const up = await client.storage.from(BUCKET).upload(path, JSON.stringify(trace), { contentType: "application/json", upsert: false });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  const ins = await client.from(TABLE).insert({ id, title: trace.title, totals: trace.totals, storage_path: path, expires_at: expiresAt });
  if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);

  return { id, expiresAt };
}

/** Null when the id is malformed, the row is missing or it has expired. */
export async function loadTrace(client: StoreClient, id: string, now: Date = new Date()): Promise<Trace | null> {
  if (!isValidId(id)) return null;
  const { data: row, error } = await client.from(TABLE).select("id, storage_path, expires_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`lookup failed: ${error.message}`);
  if (!row) return null;
  const expiresAt = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : null;
  if (expiresAt !== null && expiresAt <= now.getTime()) return null;

  const file = await client.storage.from(BUCKET).download(String(row.storage_path));
  if (file.error || !file.data) return null;
  return validateTrace(JSON.parse(await file.data.text()));
}
```

The real `SupabaseClient` is structurally compatible with `StoreClient` for these calls (`upload`, `download`, `insert`, `select().eq().maybeSingle()`); if tsc disagrees at the call site in the route, pass `getAdminClient() as unknown as StoreClient` and note it.

- [ ] **Step 3: route tests (failing)**

`app/api/share/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadTrace = vi.fn();
const getAdminClient = vi.fn();
vi.mock("@/lib/share/store", async (orig) => ({ ...(await orig<typeof import("@/lib/share/store")>()), uploadTrace }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient,
  SharingNotConfigured: class SharingNotConfigured extends Error {},
}));

import { POST } from "./route";
import { SharingNotConfigured } from "@/lib/supabase/admin";

const trace = {
  id: "s",
  source: "claude-code",
  title: "Hello",
  startedAt: "2026-09-21T10:00:00.000Z",
  endedAt: "2026-09-21T10:00:00.000Z",
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: [{ id: "a", index: 0, at: "2026-09-21T10:00:00.000Z", kind: "user", agent: "main", text: "hi" }],
};

function post(body: unknown) {
  return POST(new Request("http://localhost/api/share", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
}

describe("POST /api/share", () => {
  beforeEach(() => {
    uploadTrace.mockReset();
    getAdminClient.mockReset();
    getAdminClient.mockReturnValue({});
  });

  it("uploads a valid trace and returns the share url", async () => {
    uploadTrace.mockResolvedValue({ id: "AbCdEfGhIjKl", expiresAt: null });
    const res = await post({ trace, expiresInDays: 30 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "AbCdEfGhIjKl", url: "http://localhost/r/AbCdEfGhIjKl", expiresAt: null });
    expect(uploadTrace).toHaveBeenCalledWith({}, expect.objectContaining({ title: "Hello" }), { expiresInDays: 30 });
  });

  it("rejects invalid traces with 400", async () => {
    const res = await post({ trace: { nope: true } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be/);
  });

  it("rejects bad expiry values", async () => {
    expect((await post({ trace, expiresInDays: 3 })).status).toBe(400);
  });

  it("answers 503 when sharing is not configured", async () => {
    getAdminClient.mockImplementation(() => {
      throw new SharingNotConfigured();
    });
    const res = await post({ trace, expiresInDays: null });
    expect(res.status).toBe(503);
  });

  it("answers 400 on malformed json", async () => {
    const res = await POST(new Request("http://localhost/api/share", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: route implementation**

`app/api/share/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";
import { uploadTrace, type StoreClient } from "@/lib/share/store";
import { MAX_TRACE_BYTES, ValidationError, validateTrace } from "@/lib/share/validate";

export const runtime = "nodejs";

const EXPIRY_CHOICES = new Set([7, 30]);

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const { trace: rawTrace, expiresInDays = null } = (body ?? {}) as { trace?: unknown; expiresInDays?: unknown };
  if (expiresInDays !== null && !(typeof expiresInDays === "number" && EXPIRY_CHOICES.has(expiresInDays))) {
    return NextResponse.json({ error: "expiresInDays must be 7, 30 or null" }, { status: 400 });
  }

  let trace;
  try {
    trace = validateTrace(rawTrace);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let client: StoreClient;
  try {
    client = getAdminClient() as unknown as StoreClient;
  } catch (err) {
    if (err instanceof SharingNotConfigured) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }

  try {
    const { id, expiresAt } = await uploadTrace(client, trace, { expiresInDays });
    const url = new URL(`/r/${id}`, req.url).toString();
    return NextResponse.json({ id, url, expiresAt }, { status: 201 });
  } catch (err) {
    console.error("share upload failed", err);
    return NextResponse.json({ error: "upload failed, try again" }, { status: 502 });
  }
}

export const maxDuration = 30;
// Bodies above MAX_TRACE_BYTES fail validation; Next's default body limit for
// route handlers is higher, so validation is the effective cap.
void MAX_TRACE_BYTES;
```

Drop the `void MAX_TRACE_BYTES` line and its import if lint does not need it; it exists only to keep the comment honest. Vitest for this test runs under node; `vi.mock` must be hoisted above the imports as shown.

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add lib/share/store.ts lib/share/store.test.ts app/api/share/route.ts app/api/share/route.test.ts
git commit -m "feat(share): storage operations and the POST /api/share route"
```

---

### Task 5: Share dialog, share page, wiring

**Files:**
- Create: `components/share/ShareDialog.tsx`, `components/share/ShareDialog.test.tsx`
- Create: `components/share/SharedReplay.tsx`
- Create: `app/r/[id]/page.tsx`
- Modify: `components/trace/TopBar.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: ShareDialog test (failing)**

`components/share/ShareDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareDialog } from "./ShareDialog";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Demo",
  startedAt: T,
  endedAt: T,
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: [
    step({ id: "u", kind: "user", text: "token sk-abcdefghijklmnopqrstuvwxyz here" }),
    step({ id: "a", kind: "assistant", text: "clean" }),
  ].map((s, index) => ({ ...s, index })),
};

afterEach(() => vi.unstubAllGlobals());

describe("ShareDialog", () => {
  it("lists flagged steps with redacted previews and lets you remove one", () => {
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    expect(screen.getByText(/1 step/)).toBeTruthy();
    expect(screen.getByText(/sk-REDACTED/)).toBeTruthy();
    expect(screen.queryByText(/sk-abcdef/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /remove step/i }));
    expect(screen.getByText(/removed/i)).toBeTruthy();
  });

  it("posts the redacted trace and shows the link", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "AbCdEfGhIjKl", url: "http://x/r/AbCdEfGhIjKl", expiresAt: null }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByDisplayValue("http://x/r/AbCdEfGhIjKl")).toBeTruthy());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.trace.steps[0].text).toBe("token sk-REDACTED here");
    expect(body.expiresInDays).toBe(30);
  });

  it("shows the server error when sharing is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sharing is not configured" }), { status: 503 })));
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByText(/not configured/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: ShareDialog**

`components/share/ShareDialog.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { editStepText, removeSteps, type EditableField } from "@/lib/share/edit";
import { redactTrace, type RedactionHit } from "@/lib/share/redact";
import { toolSummary } from "@/lib/trace/summary";
import type { Step, Trace } from "@/lib/trace/types";
import { StepIcon } from "@/components/trace/StepIcon";

type Props = { trace: Trace; onClose: () => void };
type Expiry = 7 | 30 | null;
type Phase = { kind: "review" } | { kind: "busy" } | { kind: "done"; url: string; expiresAt: string | null } | { kind: "error"; message: string };

const PREVIEW = 220;

function preview(step: Step): string {
  const raw = step.text ?? step.result?.output ?? (step.tool ? `${step.tool.name} ${toolSummary(step.tool)}` : "");
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW ? flat.slice(0, PREVIEW) + "..." : flat;
}

export function ShareDialog({ trace, onClose }: Props) {
  const redacted = useMemo(() => redactTrace(trace), [trace]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { field: EditableField; value: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<Expiry>(30);
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [copied, setCopied] = useState(false);

  const stepById = useMemo(() => new Map(redacted.trace.steps.map((s) => [s.id, s])), [redacted]);

  function finalTrace(): Trace {
    let t = redacted.trace;
    for (const [id, e] of Object.entries(edits)) t = editStepText(t, id, e.field, e.value);
    return removeSteps(t, removed);
  }

  async function create() {
    setPhase({ kind: "busy" });
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trace: finalTrace(), expiresInDays: expiry }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string | null; error?: string };
      if (!res.ok || !data.url) {
        setPhase({ kind: "error", message: data.error ?? `Upload failed (${res.status})` });
        return;
      }
      setPhase({ kind: "done", url: data.url, expiresAt: data.expiresAt ?? null });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  const hits = redacted.hits;
  const remaining = redacted.trace.steps.length - removed.size;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 id="share-title" className="text-base font-semibold text-zinc-50">Share this replay</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {phase.kind === "done" ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-zinc-300">Your replay is live. Anyone with the link can watch it{phase.expiresAt ? ` until ${new Date(phase.expiresAt).toLocaleDateString()}` : ""}.</p>
            <div className="flex gap-2">
              <input readOnly value={phase.url} aria-label="Share link" className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200" />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(phase.url);
                  setCopied(true);
                }}
                className="flex items-center gap-1 rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-900"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-zinc-300">
                {hits.length === 0
                  ? "No secrets or personal paths found. Review is optional."
                  : `${hits.length} step${hits.length === 1 ? "" : "s"} had secrets or personal paths. They are redacted below; edit or remove anything else you would rather not publish.`}
              </p>
              <ul className="mt-4 space-y-3">
                {hits.map((h) => (
                  <HitRow
                    key={h.stepId}
                    hit={h}
                    step={stepById.get(h.stepId)!}
                    removed={removed.has(h.stepId)}
                    edit={edits[h.stepId]}
                    editing={editing === h.stepId}
                    onRemove={() => setRemoved((s) => new Set(s).add(h.stepId))}
                    onRestore={() =>
                      setRemoved((s) => {
                        const n = new Set(s);
                        n.delete(h.stepId);
                        return n;
                      })
                    }
                    onEdit={() => setEditing(editing === h.stepId ? null : h.stepId)}
                    onChange={(field, value) => setEdits((e) => ({ ...e, [h.stepId]: { field, value } }))}
                  />
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-5 py-4">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Expires
                <select
                  value={expiry === null ? "never" : String(expiry)}
                  onChange={(e) => setExpiry(e.target.value === "never" ? null : (Number(e.target.value) as Expiry))}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200"
                >
                  <option value="7">in 7 days</option>
                  <option value="30">in 30 days</option>
                  <option value="never">never</option>
                </select>
              </label>
              <span className="text-xs text-zinc-500">{remaining} steps will be published</span>
              {phase.kind === "error" && <span className="w-full text-xs text-red-300">{phase.message}</span>}
              <button
                type="button"
                disabled={phase.kind === "busy" || remaining === 0}
                onClick={create}
                className="ml-auto rounded-full bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              >
                {phase.kind === "busy" ? "Uploading..." : "Create link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HitRow(props: {
  hit: RedactionHit;
  step: Step;
  removed: boolean;
  edit?: { field: EditableField; value: string };
  editing: boolean;
  onRemove: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onChange: (field: EditableField, value: string) => void;
}) {
  const { hit, step, removed, edit, editing } = props;
  const field: EditableField = step.text !== undefined ? "text" : "result.output";
  const editable = step.text !== undefined || step.result !== undefined;
  const current = edit?.value ?? (field === "text" ? step.text ?? "" : step.result?.output ?? "");
  return (
    <li className={`rounded-lg border px-3 py-2 ${removed ? "border-zinc-800 opacity-60" : "border-amber-900/50 bg-amber-400/5"}`}>
      <div className="flex items-center gap-2 text-xs">
        <StepIcon kind={step.kind} className="h-3.5 w-3.5" />
        <span className="text-zinc-400">#{hit.index + 1}</span>
        <span className="truncate text-zinc-500">{hit.patterns.join(", ")}</span>
        <span className="ml-auto flex gap-2">
          {removed ? (
            <button type="button" onClick={props.onRestore} className="text-zinc-400 hover:text-zinc-200">Restore</button>
          ) : (
            <>
              {editable && (
                <button type="button" onClick={props.onEdit} className="text-zinc-400 hover:text-zinc-200">{editing ? "Done" : "Edit"}</button>
              )}
              <button type="button" aria-label="Remove step" onClick={props.onRemove} className="text-red-300 hover:text-red-200">Remove</button>
            </>
          )}
        </span>
      </div>
      {removed ? (
        <p className="mt-1 text-xs text-zinc-500">Removed from the shared replay.</p>
      ) : editing ? (
        <textarea
          value={current}
          onChange={(e) => props.onChange(field, e.target.value)}
          rows={5}
          className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-200"
        />
      ) : (
        <p className="mt-1 font-mono text-xs text-zinc-300 [overflow-wrap:anywhere]">{edit ? preview({ ...step, text: edit.value }) : preview(step)}</p>
      )}
    </li>
  );
}
```

The test's `getByText(/removed/i)` matches "Removed from the shared replay." and `getByText(/1 step/)` matches the summary sentence.

- [ ] **Step 3: SharedReplay and the share page**

`components/share/SharedReplay.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ReplayView } from "@/components/replay/ReplayView";
import type { Trace } from "@/lib/trace/types";

export function SharedReplay({ trace }: { trace: Trace }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-8">
        <span className="text-sm font-semibold tracking-tight text-zinc-300">Tracecast</span>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-200">
          Replay your own session
        </Link>
      </div>
      <ReplayView trace={trace} warnings={[]} />
    </>
  );
}
```

`app/r/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReplay } from "@/components/share/SharedReplay";
import { loadTrace, type StoreClient } from "@/lib/share/store";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await loadTrace(getAdminClient() as unknown as StoreClient, id);
  } catch (err) {
    if (err instanceof SharingNotConfigured) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const trace = await load(id);
  return trace ? { title: `${trace.title} | Tracecast` } : { title: "Replay not found | Tracecast" };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  const trace = await load(id);
  if (!trace) notFound();
  return <SharedReplay trace={trace} />;
}
```

`generateMetadata` and the page both call `load`; Next dedupes `fetch` but not our function, so wrap `load` in React `cache` from `react` (`const load = cache(async (id: string) => ...)`) to avoid two Storage downloads per request. Check `node_modules/next/dist/docs/` for the current `params` shape (Promise in Next 15+, confirm for 16) before finalizing.

- [ ] **Step 4: TopBar and page wiring**

`components/trace/TopBar.tsx`: add `onShare?: () => void` to Props and, before "Load another session", render:

```tsx
        {onShare && (
          <button type="button" onClick={onShare} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-white">
            Share
          </button>
        )}
```

`app/page.tsx`: add `const [sharing, setSharing] = useState(false);`, pass `onShare={() => setSharing(true)}` to `TopBar`, and render `{sharing && <ShareDialog trace={result.trace} onClose={() => setSharing(false)} />}` inside the `result` branch. Import `ShareDialog` from `@/components/share/ShareDialog`.

- [ ] **Step 5: Run, commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add components/share components/trace/TopBar.tsx app/page.tsx "app/r/[id]/page.tsx"
git commit -m "feat(share): share dialog with redaction review, share page and top bar button"
```

---

### Task 6: Verification

Controller only. Two paths:

- [ ] **Step 1: Without a backend**

Dev server, load `/?fixture=long`, click Share. Check: the dialog lists flagged steps with redacted previews (fixture strings like `/Users/dev` already, so hits will mostly be paths in tool inputs and any leftover token shapes), Edit shows a textarea and the preview updates, Remove greys the row and the "steps will be published" count drops, Create link shows the 503 "not configured" message. Mobile width: dialog fits.

- [ ] **Step 2: With a backend**

Either Yarin's hosted project (`.env.local` filled, migration applied) or local Supabase (`supabase init` once, `supabase start`, use the printed service role key and `http://127.0.0.1:54321`, apply the migration with `supabase db reset`). Then: Create link returns a URL, open it in a fresh (Playwright) browser with no cookies, the replay plays, totals match. Open `/r/nope` and `/r/AAAAAAAAAAAA` and confirm 404. Confirm the JSON in Storage contains `sk-REDACTED` style strings only. `npm run build` passes (sandbox off).

- [ ] **Step 3: Commit polish, final review, stop for go-ahead on chunk 5.**

---

## Roadmap notes carried forward

- **Chunk 5 (embed and previews):** `/embed/[id]` reuses `loadTrace` and renders `ReplayView` without the top bar; OG image at `/r/[id]/opengraph-image.tsx` via `next/og` drawing title, model, totals and a mini bar chart from `buildSchedule`.
- **Expired rows cleanup:** a Supabase scheduled function or a cron route that deletes expired rows and their files; not needed for v1.
- **Motion-lab swap** still pending; unchanged by this chunk.
