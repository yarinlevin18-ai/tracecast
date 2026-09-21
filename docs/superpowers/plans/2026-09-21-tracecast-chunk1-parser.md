# Tracecast Chunk 1: Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app that parses a Claude Code session (main `.jsonl` plus optional `agent-*.jsonl` subagent files) into the format-agnostic `Trace` model, verified by Vitest on redacted real fixtures, with a dev page that dumps the parsed JSON for dropped files.

**Architecture:** Parsing is pure TypeScript under `lib/trace/` with no React or Node dependencies, so it runs in the browser (nothing leaves the machine) and in Vitest. The Claude Code parser is split into three small modules: line reading (JSON per line, never throws), step extraction (one raw line becomes zero or more `Step`s), and session assembly (merge subagent files, sort by time, compute durations and totals). A fixture script strips and redacts real sessions before they enter the repo.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, Vitest 3, tsx (scripts), npm (pnpm is not installed on this Mac).

---

## Environment facts (verified 2026-09-21 on this Mac)

The handoff spec was written for Windows. This plan targets the Mac:

- Project dir: `/Users/yarin/Projects/tracecast` (git not initialized yet). Contains only `TRACECAST_HANDOFF.md`, which Task 1 moves into `docs/`.
- Sessions live at `~/.claude/projects/<project-folder>/<session-id>.jsonl`. Subagent runs live in a **sibling folder** `~/.claude/projects/<project-folder>/<session-id>/subagents/agent-<agentId>.jsonl`. They are not inline in the main file.
- Node v22.23.2, npm 10.9.8. No pnpm.
- motion-lab (`dist-spec/`) is **not on this Mac**. It is only needed from chunk 3. Copy `motion-lab-spec.json` and `MOTION_LAB.md` from the Windows machine before chunk 3 starts.

## Claude Code .jsonl format (verified against 22 real sessions, 60k+ lines)

Findings that differ from or extend the spec's notes:

- **16 line types** seen: `user`, `assistant`, `system`, `attachment`, `bridge-session`, `queue-operation`, `last-prompt`, `custom-title`, `file-history-snapshot`, `file-history-delta`, `atis-latch`, `mode`, `frame-link`, `artifact-comment-monitor`, `artifact-autoreact-ledger`, `agent-name`. Only `user`, `assistant`, and `system` matter. No `summary` type was seen.
- `user`/`assistant` lines always carry `uuid`, `parentUuid`, `timestamp`, `sessionId`, `isSidechain`.
- `message.content` is a string (749 user lines) or a block array. Block types seen: `text`, `thinking`, `tool_use`, `tool_result`, `image`.
- **Split assistant turns confirmed**: one line per content block, each with the same `message.id` and the full `message.usage`. 762 message ids were shared across lines in one session. Count usage once per `message.id`.
- `message.usage` fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus nested extras. `message.model` holds the model id.
- `tool_result` blocks: `{ tool_use_id, type, content, is_error }`. `content` is a string or an array of `text`/`image` blocks.
- `user` lines with `isMeta: true` are injected context, not the human. Skip them.
- `user` text starting with `<command-name>`, `<command-message>`, `<local-command-stdout>` etc. are slash-command echoes. Skip them.
- `user` lines with `isCompactSummary: true` carry the re-injected compaction summary. Render as a `system` step.
- `system` line subtypes: `api_error` (retry noise), `stop_hook_summary`, `local_command`, `compact_boundary`. Only `compact_boundary` becomes a step.
- **Subagent linkage**: the main file's `tool_use` block named `Agent` has `input.description`, `input.subagent_type`, `input.prompt`. The matching `user` line holding its `tool_result` has a top-level `toolUseResult.agentId` (e.g. `a7fbe9950e4469a6e`). The file `subagents/agent-<agentId>.jsonl` holds that run. Its lines have `isSidechain: true` and `agentId` at top level.
- Timestamps on subagent lines are real wall-clock, so main and subagent steps can be merged by time.
- Every `user`/`assistant` line in 122 files had both `uuid` and `timestamp`. No `isMeta` line carried a `tool_result`.
- **7 of 8228** assistant messages with `usage` have no renderable content (empty `content`). Their tokens must still be counted: fold them into the last emitted step.
- `message.model` is sometimes `"<synthetic>"` (76 lines, never the first assistant line). Skip models starting with `<` when picking `trace.model`.

## File structure

```
tracecast/
  docs/
    TRACECAST_HANDOFF.md                 (moved from root)
    superpowers/plans/                   (this plan)
  app/
    dev/parse/page.tsx                   dev page: drop files, dump Trace JSON
  lib/trace/
    types.ts                             Trace, Step, ParseResult, SessionFile
    secrets.ts                           regex list + redactText(); used by fixture script now, redaction UI in chunk 4
    parsers/claude-code/
      raw.ts                             RawLine types + readLines(text)
      blocks.ts                          toBlocks(), flattenResult()
      steps.ts                           linesToSteps(lines, agent, warnings)
      index.ts                           parseClaudeCode(), parseClaudeCodeSession()
      __tests__/inline.test.ts           hand-built lines, one rule per test
      __tests__/fixtures.test.ts         invariants over every fixture dir, oracle computed from raw JSON
  scripts/
    make-fixture.ts                      strip + redact a real session into fixtures/<name>/
  fixtures/
    <name>/main.jsonl
    <name>/agent-<id>.jsonl              (only when the session had subagents)
  vitest.config.ts
```

## Proposed fixtures (Yarin confirms before Task 8)

Sizes are the raw files. After stripping non-message lines they shrink a lot.

| name        | source (under `~/.claude/projects/`)                                                    | lines | subagents |
|-------------|-----------------------------------------------------------------------------------------|-------|-----------|
| `short`     | `-Users-yarin-Projects/cf6a9ce8-76fc-4d05-87bb-6f613325f854.jsonl`                       | 246   | no        |
| `subagents` | `-Users-yarin-Projects-Jarvis-Build/4bb141e0-4faa-4c30-a6af-d4e2efa7996a.jsonl`          | 206   | yes       |
| `long`      | `-Users-yarin-Projects-dropshipping/00933dcb-367b-4532-8cd3-80880b4e681b.jsonl`          | 1141  | yes       |

Alternatives if any of those are too personal: `-Users-yarin-Projects/0d14c2bf-...` (479 lines), `-Users-yarin-Projects/c288b150-...` (522 lines), `-Users-yarin-Projects/e1a188f2-...` (270 lines, subagents).

---

### Task 1: Scaffold the app

**Files:**
- Move: `TRACECAST_HANDOFF.md` to `docs/TRACECAST_HANDOFF.md`
- Create: Next.js app in `/Users/yarin/Projects/tracecast` (create-next-app refuses a dir containing a stray `.md`, `docs/` is on its allowlist)
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Move the handoff and init git**

```bash
cd /Users/yarin/Projects/tracecast
mkdir -p docs && mv TRACECAST_HANDOFF.md docs/TRACECAST_HANDOFF.md
git init -b main
```

- [ ] **Step 2: Scaffold Next.js**

```bash
cd /Users/yarin/Projects/tracecast
npx --yes create-next-app@latest . --yes --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

Expected: a `package.json`, `app/`, `tsconfig.json` with `"strict": true` and `"@/*": ["./*"]`. If it prompts for Turbopack, accept the default.

- [ ] **Step 3: Add Vitest and tsx**

```bash
cd /Users/yarin/Projects/tracecast
npm i -D vitest tsx
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

- [ ] **Step 5: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"fixture": "tsx scripts/make-fixture.ts"
```

- [ ] **Step 6: Verify the toolchain**

```bash
cd /Users/yarin/Projects/tracecast
npx tsc --noEmit && npm test
```

Expected: tsc exits 0. Vitest prints `No test files found` and exits 0 (or 1 with that message, which is fine at this point).

- [ ] **Step 7: Commit**

```bash
cd /Users/yarin/Projects/tracecast
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Trace types

**Files:**
- Create: `lib/trace/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type TraceSource = "claude-code" | "otel";

export type StepKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "subagent"
  | "system";

export type Trace = {
  id: string;
  source: TraceSource;
  title: string;
  startedAt: string;
  endedAt: string;
  model?: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    toolCalls: number;
    durationMs: number;
  };
  steps: Step[];
};

export type Step = {
  id: string;
  parentId?: string;
  index: number;
  at: string;
  durationMs?: number;
  kind: StepKind;
  agent: string;
  text?: string;
  tool?: { name: string; input: unknown; callId: string };
  result?: { callId: string; output: string; isError: boolean };
  tokens?: { input: number; output: number };
};

/** A Step before ordering: no index or duration yet. */
export type DraftStep = Omit<Step, "index" | "durationMs">;

export type ParseResult = { trace: Trace; warnings: string[] };

/** One dropped file. `name` is used to tell main from agent-*.jsonl files. */
export type SessionFile = { name: string; text: string };
```

Note on `tokens.input`: it is `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, i.e. total context the model read for that turn. Cached reads dominate real sessions, so counting only `input_tokens` would show numbers like 2 per turn.

- [ ] **Step 2: Type-check and commit**

```bash
cd /Users/yarin/Projects/tracecast
npx tsc --noEmit && git add lib/trace/types.ts && git commit -m "feat(trace): add core Trace and Step types"
```

---

### Task 3: Line reader

**Files:**
- Create: `lib/trace/parsers/claude-code/raw.ts`
- Test: `lib/trace/parsers/claude-code/__tests__/inline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/trace/parsers/claude-code/__tests__/inline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readLines } from "../raw";

describe("readLines", () => {
  it("parses one object per line and skips bad lines with a warning", () => {
    const text = [
      JSON.stringify({ type: "user", uuid: "a" }),
      "",
      "{ not json",
      "[1,2]",
      JSON.stringify({ type: "assistant", uuid: "b" }),
    ].join("\n");

    const { lines, warnings } = readLines(text);

    expect(lines.map((l) => l.uuid)).toEqual(["a", "b"]);
    expect(warnings).toEqual([
      "line 3: invalid JSON, skipped",
      "line 4: not an object, skipped",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
```

Expected: FAIL, cannot resolve `../raw`.

- [ ] **Step 3: Implement `raw.ts`**

```ts
export type RawBlock = {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

export type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type RawMessage = {
  id?: string;
  role?: string;
  model?: string;
  content?: string | RawBlock[];
  usage?: RawUsage;
};

export type RawLine = {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  agentId?: string;
  subtype?: string;
  message?: RawMessage;
  toolUseResult?: unknown;
};

export function readLines(text: string): { lines: RawLine[]; warnings: string[] } {
  const lines: RawLine[] = [];
  const warnings: string[] = [];

  text.split(/\r?\n/).forEach((row, i) => {
    const trimmed = row.trim();
    if (!trimmed) return;
    try {
      const value: unknown = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        lines.push(value as RawLine);
      } else {
        warnings.push(`line ${i + 1}: not an object, skipped`);
      }
    } catch {
      warnings.push(`line ${i + 1}: invalid JSON, skipped`);
    }
  });

  return { lines, warnings };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/yarin/Projects/tracecast
git add lib/trace/parsers/claude-code && git commit -m "feat(parser): read Claude Code jsonl lines without throwing"
```

---

### Task 4: Content block helpers

**Files:**
- Create: `lib/trace/parsers/claude-code/blocks.ts`
- Test: `lib/trace/parsers/claude-code/__tests__/inline.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Add to `inline.test.ts` (update the import block at the top):

```ts
import { flattenResult, toBlocks } from "../blocks";

describe("toBlocks", () => {
  it("wraps string content as a single text block", () => {
    expect(toBlocks("hi")).toEqual([{ type: "text", text: "hi" }]);
  });

  it("passes arrays through and drops non-objects", () => {
    expect(toBlocks([{ type: "text", text: "a" }, null as never, "x" as never])).toEqual([
      { type: "text", text: "a" },
    ]);
  });

  it("returns [] for undefined", () => {
    expect(toBlocks(undefined)).toEqual([]);
  });
});

describe("flattenResult", () => {
  it("keeps strings", () => {
    expect(flattenResult("out")).toBe("out");
  });

  it("joins text blocks and marks images", () => {
    expect(
      flattenResult([
        { type: "text", text: "line 1" },
        { type: "image", source: {} },
        { type: "text", text: "line 2" },
      ])
    ).toBe("line 1\n[image]\nline 2");
  });

  it("stringifies other JSON", () => {
    expect(flattenResult({ a: 1 })).toBe('{"a":1}');
    expect(flattenResult(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
```

Expected: FAIL, cannot resolve `../blocks`.

- [ ] **Step 3: Implement `blocks.ts`**

```ts
import type { RawBlock } from "./raw";

export function toBlocks(content: string | RawBlock[] | undefined): RawBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) {
    return content.filter((b): b is RawBlock => !!b && typeof b === "object");
  }
  return [];
}

/** Turn tool_result content (string, block array, or anything) into display text. */
export function flattenResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b || typeof b !== "object") return "";
        const block = b as RawBlock;
        if (block.type === "text") return block.text ?? "";
        if (block.type === "image") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content);
}
```

- [ ] **Step 4: Run to verify pass, then commit**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
git add lib/trace/parsers/claude-code && git commit -m "feat(parser): content block helpers"
```

Expected: 7 passed.

---

### Task 5: Line to steps

**Files:**
- Create: `lib/trace/parsers/claude-code/steps.ts`
- Test: `lib/trace/parsers/claude-code/__tests__/inline.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
import { linesToSteps } from "../steps";
import type { RawLine } from "../raw";

const T0 = "2026-09-21T10:00:00.000Z";
const T1 = "2026-09-21T10:00:01.000Z";
const T2 = "2026-09-21T10:00:02.000Z";

const usage = {
  input_tokens: 2,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 300,
  output_tokens: 40,
};

describe("linesToSteps", () => {
  it("merges a split assistant message and counts usage once", () => {
    const lines: RawLine[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: T0,
        message: { id: "msg_1", model: "claude-x", content: [{ type: "thinking", thinking: "hmm" }], usage },
      },
      {
        type: "assistant",
        uuid: "a2",
        timestamp: T1,
        message: { id: "msg_1", model: "claude-x", content: [{ type: "text", text: "Hello" }], usage },
      },
      {
        type: "assistant",
        uuid: "a3",
        timestamp: T2,
        message: {
          id: "msg_1",
          content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { path: "x" } }],
          usage,
        },
      },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps.map((s) => s.kind)).toEqual(["thinking", "assistant", "tool_call"]);
    expect(steps[0].tokens).toEqual({ input: 402, output: 40 });
    expect(steps[1].tokens).toBeUndefined();
    expect(steps[2].tool).toEqual({ name: "Read", input: { path: "x" }, callId: "toolu_1" });
    expect(steps.every((s) => s.agent === "main")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("emits tool_result steps from user lines and flattens content", () => {
    const lines: RawLine[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: T0,
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "ok" }] },
            { type: "tool_result", tool_use_id: "toolu_2", content: "boom", is_error: true },
          ],
        },
      },
    ];
    const steps = linesToSteps(lines, "main", []);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ id: "u1:0", kind: "tool_result", result: { callId: "toolu_1", output: "ok", isError: false } });
    expect(steps[1]).toMatchObject({ id: "u1:1", result: { callId: "toolu_2", output: "boom", isError: true } });
  });

  it("keeps human prompts, skips meta and command echoes, and maps compact summaries to system", () => {
    const lines: RawLine[] = [
      { type: "user", uuid: "u1", timestamp: T0, message: { content: "Fix the bug" } },
      { type: "user", uuid: "u2", timestamp: T0, isMeta: true, message: { content: "injected context" } },
      { type: "user", uuid: "u3", timestamp: T0, message: { content: "<command-name>/clear</command-name>" } },
      { type: "user", uuid: "u4", timestamp: T1, isCompactSummary: true, message: { content: "Summary of earlier work" } },
      { type: "user", uuid: "u5", timestamp: T1, message: { content: [{ type: "image" }, { type: "text", text: "  see this  " }] } },
    ];
    const steps = linesToSteps(lines, "main", []);

    expect(steps.map((s) => [s.kind, s.text])).toEqual([
      ["user", "Fix the bug"],
      ["system", "Context compacted"],
      ["user", "[image]"],
      ["user", "see this"],
    ]);
  });

  it("skips unknown line types and non compact_boundary system lines", () => {
    const lines: RawLine[] = [
      { type: "attachment", uuid: "x", timestamp: T0 },
      { type: "system", uuid: "s1", timestamp: T0, subtype: "api_error" },
      { type: "system", uuid: "s2", timestamp: T1, subtype: "compact_boundary" },
      { type: "user", uuid: "u9", message: { content: "no timestamp" } },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps.map((s) => s.kind)).toEqual(["system"]);
    expect(warnings).toEqual(["user line u9 has no timestamp, skipped"]);
  });

  it("warns on unknown block types", () => {
    const warnings: string[] = [];
    linesToSteps(
      [{ type: "assistant", uuid: "a1", timestamp: T0, message: { id: "m", content: [{ type: "weird" }] } }],
      "main",
      warnings
    );
    expect(warnings).toEqual(['assistant line a1: unknown block type "weird"']);
  });

  it("folds usage from empty messages into the last step with a warning", () => {
    const lines: RawLine[] = [
      { type: "assistant", uuid: "a1", timestamp: T0, message: { id: "m1", content: [{ type: "text", text: "Hi" }], usage: { input_tokens: 1, output_tokens: 1 } } },
      { type: "assistant", uuid: "a2", timestamp: T1, message: { id: "m2", content: [], usage: { input_tokens: 5, output_tokens: 6 } } },
    ];
    const warnings: string[] = [];
    const steps = linesToSteps(lines, "main", warnings);

    expect(steps).toHaveLength(1);
    expect(steps[0].tokens).toEqual({ input: 6, output: 7 });
    expect(warnings).toEqual(["1 message(s) had usage but no content; tokens added to step a1:0"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
```

Expected: FAIL, cannot resolve `../steps`.

- [ ] **Step 3: Implement `steps.ts`**

```ts
import type { DraftStep } from "@/lib/trace/types";
import { flattenResult, toBlocks } from "./blocks";
import type { RawLine, RawUsage } from "./raw";

const COMMAND_ECHO =
  /^\s*<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|system-reminder)/;

function usageTokens(u: RawUsage | undefined): DraftStep["tokens"] | undefined {
  if (!u) return undefined;
  return {
    input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
  };
}

/**
 * Convert raw lines from ONE file into draft steps, in file order.
 * `agent` is "main" or the subagent's display name. `warnings` is appended to.
 */
export function linesToSteps(lines: RawLine[], agent: string, warnings: string[]): DraftStep[] {
  const steps: DraftStep[] = [];
  const seenMessageIds = new Set<string>();
  const pending = new Map<string, NonNullable<DraftStep["tokens"]>>();

  for (const line of lines) {
    const { type, uuid, timestamp: at } = line;
    if (type !== "user" && type !== "assistant" && type !== "system") continue;
    if (!uuid) continue;
    if (!at) {
      if (type !== "system") warnings.push(`${type} line ${uuid} has no timestamp, skipped`);
      continue;
    }

    if (type === "system") {
      if (line.subtype === "compact_boundary") {
        steps.push({ id: uuid, at, kind: "system", agent, text: "Context compacted" });
      }
      continue;
    }

    if (type === "user") {
      if (line.isMeta) continue;
      if (line.isCompactSummary) {
        steps.push({ id: uuid, at, kind: "system", agent, text: "Context compacted" });
        continue;
      }
      toBlocks(line.message?.content).forEach((b, bi) => {
        const id = `${uuid}:${bi}`;
        if (b.type === "tool_result") {
          steps.push({
            id,
            at,
            kind: "tool_result",
            agent,
            result: { callId: b.tool_use_id ?? "", output: flattenResult(b.content), isError: b.is_error === true },
          });
        } else if (b.type === "text") {
          const text = (b.text ?? "").trim();
          if (!text || COMMAND_ECHO.test(text)) return;
          steps.push({ id, at, kind: "user", agent, text });
        } else if (b.type === "image") {
          steps.push({ id, at, kind: "user", agent, text: "[image]" });
        } else {
          warnings.push(`user line ${uuid}: unknown block type "${b.type}"`);
        }
      });
      continue;
    }

    // assistant
    const msg = line.message;
    const msgId = msg?.id ?? uuid;
    if (!seenMessageIds.has(msgId)) {
      seenMessageIds.add(msgId);
      const tokens = usageTokens(msg?.usage);
      if (tokens) pending.set(msgId, tokens);
    }

    toBlocks(msg?.content).forEach((b, bi) => {
      const id = `${uuid}:${bi}`;
      let step: DraftStep | undefined;
      if (b.type === "text") {
        const text = (b.text ?? "").trim();
        if (text) step = { id, at, kind: "assistant", agent, text };
      } else if (b.type === "thinking") {
        const text = (b.thinking ?? "").trim();
        if (text) step = { id, at, kind: "thinking", agent, text };
      } else if (b.type === "tool_use") {
        step = { id, at, kind: "tool_call", agent, tool: { name: b.name ?? "unknown", input: b.input, callId: b.id ?? "" } };
      } else {
        warnings.push(`assistant line ${uuid}: unknown block type "${b.type}"`);
      }
      if (step) {
        const tokens = pending.get(msgId);
        if (tokens) {
          step.tokens = tokens;
          pending.delete(msgId);
        }
        steps.push(step);
      }
    });
  }

  // Usage from messages that produced no step (empty content) still counts.
  if (pending.size > 0) {
    const leftover = { input: 0, output: 0 };
    for (const t of pending.values()) {
      leftover.input += t.input;
      leftover.output += t.output;
    }
    const last = steps[steps.length - 1];
    if (last) {
      last.tokens = { input: (last.tokens?.input ?? 0) + leftover.input, output: (last.tokens?.output ?? 0) + leftover.output };
      warnings.push(`${pending.size} message(s) had usage but no content; tokens added to step ${last.id}`);
    } else {
      warnings.push(`${pending.size} message(s) had usage but no content; tokens dropped`);
    }
  }

  return steps;
}
```

- [ ] **Step 4: Run to verify pass, then commit**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
git add lib/trace/parsers/claude-code && git commit -m "feat(parser): map user, assistant and system lines to steps"
```

Expected: 13 passed.

---

### Task 6: Session assembly (main + subagents, ordering, totals)

**Files:**
- Create: `lib/trace/parsers/claude-code/index.ts`
- Test: `lib/trace/parsers/claude-code/__tests__/inline.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
import { parseClaudeCode, parseClaudeCodeSession } from "../index";

function jsonl(objs: object[]): string {
  return objs.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

describe("parseClaudeCodeSession", () => {
  const mainText = jsonl([
    { type: "user", uuid: "u1", timestamp: T0, sessionId: "sess-1", message: { content: "Review the   caption   treatment please" } },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: T1,
      message: {
        id: "m1",
        model: "claude-x",
        content: [{ type: "tool_use", id: "toolu_agent", name: "Agent", input: { description: "Review captions", prompt: "..." } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
    {
      type: "user",
      uuid: "u2",
      timestamp: "2026-09-21T10:00:05.000Z",
      toolUseResult: { agentId: "abc123", status: "done" },
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_agent", content: "done" }] },
    },
    {
      type: "user",
      uuid: "u3",
      timestamp: "2026-09-21T10:00:06.000Z",
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_missing", content: "orphan" }] },
    },
  ]);

  const subText = jsonl([
    { type: "user", uuid: "s1", timestamp: T2, isSidechain: true, agentId: "abc123", message: { content: "Review captions" } },
    {
      type: "assistant",
      uuid: "s2",
      timestamp: "2026-09-21T10:00:03.000Z",
      isSidechain: true,
      agentId: "abc123",
      message: { id: "m2", content: [{ type: "text", text: "Looks good" }], usage: { input_tokens: 7, output_tokens: 3 } },
    },
  ]);

  it("merges subagent steps by time with parentId and agent name", () => {
    const { trace, warnings } = parseClaudeCodeSession([
      { name: "abc.jsonl", text: mainText },
      { name: "agent-abc123.jsonl", text: subText },
    ]);

    expect(trace.id).toBe("sess-1");
    expect(trace.source).toBe("claude-code");
    expect(trace.model).toBe("claude-x");
    expect(trace.title).toBe("Review the caption treatment please");
    expect(trace.steps.map((s) => [s.index, s.kind, s.agent])).toEqual([
      [0, "user", "main"],
      [1, "tool_call", "main"],
      [2, "user", "Review captions"],
      [3, "assistant", "Review captions"],
      [4, "tool_result", "main"],
      [5, "tool_result", "main"],
    ]);
    expect(trace.steps[2].parentId).toBe("a1:0");
    expect(trace.steps[3].parentId).toBe("a1:0");
    expect(trace.steps[1].parentId).toBeUndefined();
    expect(trace.steps.map((s) => s.durationMs)).toEqual([1000, 1000, 1000, 2000, 1000, 0]);
    expect(trace.startedAt).toBe(T0);
    expect(trace.endedAt).toBe("2026-09-21T10:00:06.000Z");
    expect(trace.totals).toEqual({ inputTokens: 17, outputTokens: 8, toolCalls: 1, durationMs: 6000 });
    expect(warnings).toEqual(["tool_result u3:0 has no matching tool_call (toolu_missing)"]);
  });

  it("parseClaudeCode handles a single file", () => {
    const { trace } = parseClaudeCode(mainText);
    expect(trace.steps).toHaveLength(4);
    expect(trace.steps.every((s) => s.agent === "main")).toBe(true);
  });

  it("returns an empty trace with a warning when nothing parses", () => {
    const { trace, warnings } = parseClaudeCode("not json\n");
    expect(trace.steps).toEqual([]);
    expect(trace.title).toBe("Untitled session");
    expect(warnings).toContain("no steps found");
  });

  it("truncates long titles to 80 chars", () => {
    const { trace } = parseClaudeCode(
      jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "x".repeat(200) } }])
    );
    expect(trace.title).toHaveLength(80);
    expect(trace.title.endsWith("...")).toBe(true);
  });

  it("warns when a subagent file has no matching Agent call", () => {
    const { trace, warnings } = parseClaudeCodeSession([
      { name: "main.jsonl", text: jsonl([{ type: "user", uuid: "u1", timestamp: T0, message: { content: "hi" } }]) },
      { name: "agent-zzz.jsonl", text: subText },
    ]);
    expect(warnings).toContain("agent-zzz.jsonl: no matching Agent call in main session (abc123)");
    expect(trace.steps.filter((s) => s.agent === "abc123")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code
```

Expected: FAIL, cannot resolve `../index`.

- [ ] **Step 3: Implement `index.ts`**

```ts
import type { DraftStep, ParseResult, SessionFile, Step, Trace } from "@/lib/trace/types";
import { toBlocks } from "./blocks";
import { readLines, type RawLine } from "./raw";
import { linesToSteps } from "./steps";

const TITLE_MAX = 80;
const UNTITLED = "Untitled session";

type ParsedFile = { name: string; lines: RawLine[] };

function isSubagentFile(file: ParsedFile): boolean {
  if (/^agent-.*\.jsonl$/i.test(file.name)) return true;
  const first = file.lines.find((l) => l.type === "user" || l.type === "assistant");
  return first?.isSidechain === true;
}

function makeTitle(steps: DraftStep[]): string {
  const first = steps.find((s) => s.kind === "user" && s.text && s.text !== "[image]");
  if (!first?.text) return UNTITLED;
  const flat = first.text.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? flat.slice(0, TITLE_MAX - 3) + "..." : flat;
}

/** Map agentId -> id of the main-session tool_call step that spawned it. */
function findAgentCalls(mainLines: RawLine[], mainSteps: DraftStep[]): Map<string, DraftStep> {
  const callsById = new Map<string, DraftStep>();
  for (const s of mainSteps) if (s.kind === "tool_call" && s.tool) callsById.set(s.tool.callId, s);

  const out = new Map<string, DraftStep>();
  for (const line of mainLines) {
    const result = line.toolUseResult as { agentId?: unknown } | undefined;
    if (typeof result?.agentId !== "string") continue;
    const block = toBlocks(line.message?.content).find((b) => b.type === "tool_result");
    const call = block?.tool_use_id ? callsById.get(block.tool_use_id) : undefined;
    if (call) out.set(result.agentId, call);
  }
  return out;
}

function agentDisplayName(call: DraftStep | undefined, agentId: string): string {
  const input = call?.tool?.input as { description?: unknown } | undefined;
  return typeof input?.description === "string" && input.description.trim() ? input.description.trim() : agentId;
}

export function parseClaudeCodeSession(files: SessionFile[]): ParseResult {
  const warnings: string[] = [];
  const parsed: ParsedFile[] = files.map((f) => {
    const { lines, warnings: w } = readLines(f.text);
    warnings.push(...w.map((msg) => `${f.name}: ${msg}`));
    return { name: f.name, lines };
  });

  const subs = parsed.filter(isSubagentFile);
  const mains = parsed.filter((p) => !isSubagentFile(p));
  if (mains.length > 1) warnings.push(`multiple main session files given, using ${mains[0].name}`);
  const main: ParsedFile = mains[0] ?? { name: "main", lines: [] };

  const draft = linesToSteps(main.lines, "main", warnings);
  const agentCalls = findAgentCalls(main.lines, draft);

  for (const sub of subs) {
    const agentId = sub.lines.find((l) => typeof l.agentId === "string")?.agentId ?? sub.name.replace(/^agent-|\.jsonl$/gi, "");
    const call = agentCalls.get(agentId);
    if (!call) warnings.push(`${sub.name}: no matching Agent call in main session (${agentId})`);
    const name = agentDisplayName(call, agentId);
    for (const s of linesToSteps(sub.lines, name, warnings)) {
      draft.push(call ? { ...s, parentId: call.id } : s);
    }
  }

  const ordered = draft
    .map((s, i) => ({ s, i, t: Date.parse(s.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i);

  const steps: Step[] = ordered.map(({ s }, index) => {
    const next = ordered[index + 1];
    const durationMs = next ? Math.max(0, next.t - ordered[index].t) : 0;
    return { ...s, index, durationMs };
  });

  const callIds = new Set(steps.filter((s) => s.kind === "tool_call").map((s) => s.tool!.callId));
  for (const s of steps) {
    if (s.kind === "tool_result" && s.result && !callIds.has(s.result.callId)) {
      warnings.push(`tool_result ${s.id} has no matching tool_call (${s.result.callId})`);
    }
  }

  if (steps.length === 0) warnings.push("no steps found");

  const startedAt = steps[0]?.at ?? "";
  const endedAt = steps[steps.length - 1]?.at ?? "";
  const totals = steps.reduce(
    (acc, s) => {
      acc.inputTokens += s.tokens?.input ?? 0;
      acc.outputTokens += s.tokens?.output ?? 0;
      if (s.kind === "tool_call") acc.toolCalls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: steps.length ? Date.parse(endedAt) - Date.parse(startedAt) : 0 }
  );

  const model = main.lines.find(
    (l) => l.type === "assistant" && typeof l.message?.model === "string" && !l.message.model.startsWith("<")
  )?.message?.model;
  const id = main.lines.find((l) => typeof l.sessionId === "string")?.sessionId ?? "unknown";

  const trace: Trace = {
    id,
    source: "claude-code",
    title: makeTitle(draft),
    startedAt,
    endedAt,
    ...(model ? { model } : {}),
    totals,
    steps,
  };

  return { trace, warnings };
}

export function parseClaudeCode(text: string): ParseResult {
  return parseClaudeCodeSession([{ name: "main.jsonl", text }]);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/parsers/claude-code && npx tsc --noEmit
```

Expected: 18 passed, tsc clean. If the `durationMs` expectation fails on the `[2000]` entry, recheck the test timestamps: s2 is at 10:00:03 and u2 at 10:00:05, so 2000 is right.

- [ ] **Step 5: Commit**

```bash
cd /Users/yarin/Projects/tracecast
git add lib/trace/parsers/claude-code && git commit -m "feat(parser): assemble trace from main and subagent session files"
```

---

### Task 7: Secret patterns and the fixture script

**Files:**
- Create: `lib/trace/secrets.ts`
- Create: `lib/trace/secrets.test.ts`
- Create: `scripts/make-fixture.ts`

- [ ] **Step 1: Write the failing test `lib/trace/secrets.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { redactText } from "./secrets";

describe("redactText", () => {
  it("masks common credential shapes", () => {
    expect(redactText("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123")).toBe("key sk-REDACTED");
    expect(redactText("aws AKIAIOSFODNN7EXAMPLE")).toBe("aws AKIA-REDACTED");
    expect(redactText("gh ghp_abcdefghijklmnopqrstuvwxyz1234")).toBe("gh gh_REDACTED");
    expect(redactText("slack xoxb-1234567890-abcdef")).toBe("slack xox-REDACTED");
    expect(redactText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop")).toBe("jwt JWT-REDACTED");
  });

  it("masks env assignments, emails and the home dir", () => {
    expect(redactText("OPENAI_API_KEY=abc123 DB_PASSWORD=hunter2")).toBe("OPENAI_API_KEY=REDACTED DB_PASSWORD=REDACTED");
    expect(redactText("mail yarinlevin18@gmail.com now")).toBe("mail user@example.com now");
    expect(redactText("/Users/yarin/Projects/x")).toBe("/Users/dev/Projects/x");
  });

  it("masks private key blocks", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nabc\ndef\n-----END RSA PRIVATE KEY-----";
    expect(redactText(`x ${key} y`)).toBe("x [PRIVATE KEY REDACTED] y");
  });

  it("leaves ordinary text alone", () => {
    expect(redactText("const x = 1; // nothing here")).toBe("const x = 1; // nothing here");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/secrets.test.ts
```

Expected: FAIL, cannot resolve `./secrets`.

- [ ] **Step 3: Implement `lib/trace/secrets.ts`**

```ts
export type SecretPattern = { name: string; pattern: RegExp; replacement: string };

/** Order matters: private keys and JWTs first so their inner text is not partially matched later. */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[PRIVATE KEY REDACTED]",
  },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: "JWT-REDACTED" },
  { name: "anthropic/openai", pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: "sk-REDACTED" },
  { name: "aws", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "AKIA-REDACTED" },
  { name: "github", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replacement: "gh_REDACTED" },
  { name: "slack", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replacement: "xox-REDACTED" },
  { name: "env-assignment", pattern: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS))=\S+/g, replacement: "$1=REDACTED" },
  { name: "email", pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, replacement: "user@example.com" },
  { name: "home-dir", pattern: /\/Users\/yarin\b/g, replacement: "/Users/dev" },
];

export function redactText(text: string): string {
  return SECRET_PATTERNS.reduce((acc, p) => acc.replace(p.pattern, p.replacement), text);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd /Users/yarin/Projects/tracecast && npx vitest run lib/trace/secrets.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Write `scripts/make-fixture.ts`**

This keeps only `user`/`assistant`/`system` lines, drops fields the parser does not read, blanks image data, redacts every string, and copies subagent files from the sibling `<session-id>/subagents/` dir.

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { redactText } from "../lib/trace/secrets";

const KEEP_TYPES = new Set(["user", "assistant", "system"]);
const KEEP_LINE_KEYS = ["type", "uuid", "parentUuid", "timestamp", "sessionId", "isSidechain", "isMeta", "isCompactSummary", "agentId", "subtype"] as const;
const KEEP_MESSAGE_KEYS = ["id", "role", "model", "content", "usage"] as const;

type Obj = Record<string, unknown>;

function pick(src: Obj, keys: readonly string[]): Obj {
  const out: Obj = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const obj = value as Obj;
    if (obj.type === "image") return { type: "image" };
    const out: Obj = {};
    for (const [k, v] of Object.entries(obj)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

function stripLine(raw: string): string | null {
  let line: Obj;
  try {
    line = JSON.parse(raw) as Obj;
  } catch {
    return null;
  }
  if (!KEEP_TYPES.has(String(line.type))) return null;

  const out = pick(line, KEEP_LINE_KEYS);
  if (line.message && typeof line.message === "object") {
    out.message = pick(line.message as Obj, KEEP_MESSAGE_KEYS);
  }
  const tur = line.toolUseResult as Obj | undefined;
  if (tur && typeof tur === "object" && typeof tur.agentId === "string") {
    out.toolUseResult = { agentId: tur.agentId };
  }
  return JSON.stringify(redactDeep(out));
}

function convert(srcPath: string, destPath: string): void {
  const rows = readFileSync(srcPath, "utf8").split(/\r?\n/);
  const kept = rows.map(stripLine).filter((r): r is string => r !== null);
  writeFileSync(destPath, kept.join("\n") + "\n");
  console.log(`${basename(destPath)}: ${rows.length} -> ${kept.length} lines`);
}

const [srcArg, nameArg] = process.argv.slice(2);
if (!srcArg || !nameArg) {
  console.error("usage: npm run fixture -- <path/to/session.jsonl> <fixture-name>");
  process.exit(1);
}

const destDir = join(process.cwd(), "fixtures", nameArg);
mkdirSync(destDir, { recursive: true });
convert(srcArg, join(destDir, "main.jsonl"));

const subDir = join(dirname(srcArg), basename(srcArg, ".jsonl"), "subagents");
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))) {
    convert(join(subDir, f), join(destDir, f));
  }
}
```

- [ ] **Step 6: Type-check the script and commit**

```bash
cd /Users/yarin/Projects/tracecast && npx tsc --noEmit
git add lib/trace/secrets.ts lib/trace/secrets.test.ts scripts/make-fixture.ts
git commit -m "feat: secret patterns and fixture stripping script"
```

If tsc complains that `scripts/` is outside `include`, add `"scripts/**/*.ts"` to the `include` array in `tsconfig.json` and commit that too.

---

### Task 8: Create the fixtures (needs Yarin's fixture confirmation)

**Files:**
- Create: `fixtures/short/main.jsonl`
- Create: `fixtures/subagents/main.jsonl` + `fixtures/subagents/agent-*.jsonl`
- Create: `fixtures/long/main.jsonl` + `fixtures/long/agent-*.jsonl`

- [ ] **Step 1: Generate**

```bash
cd /Users/yarin/Projects/tracecast
P=/Users/yarin/.claude/projects
npm run fixture -- "$P/-Users-yarin-Projects/cf6a9ce8-76fc-4d05-87bb-6f613325f854.jsonl" short
npm run fixture -- "$P/-Users-yarin-Projects-Jarvis-Build/4bb141e0-4faa-4c30-a6af-d4e2efa7996a.jsonl" subagents
npm run fixture -- "$P/-Users-yarin-Projects-dropshipping/00933dcb-367b-4532-8cd3-80880b4e681b.jsonl" long
```

Expected: each prints `main.jsonl: N -> M lines` with M well below N, plus one line per agent file for `subagents` and `long`.

- [ ] **Step 2: Manual sensitivity review (do not skip)**

```bash
cd /Users/yarin/Projects/tracecast
du -sh fixtures/*
grep -rIoE "sk-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{8,}|ghp_[A-Za-z0-9]{8,}|xox[baprs]-|password|passwd|secret|@gmail|Bearer " fixtures | sort | uniq -c | sort -rn | head -40
```

Expected: only hits like `sk-REDACTED`, or the words `password`/`secret` in ordinary code context. Read every non-obvious hit in place. If a fixture contains something Yarin would not put in a public repo and regexes cannot catch it, drop that fixture and pick an alternative from the table above.

Also check total size stays reasonable for git (under ~10 MB across all fixtures). If `long` is bigger, pick a shorter alternative.

- [ ] **Step 3: Commit**

```bash
cd /Users/yarin/Projects/tracecast
git add fixtures && git commit -m "test: add redacted Claude Code session fixtures"
```

---

### Task 9: Fixture tests with an independent oracle

**Files:**
- Create: `lib/trace/parsers/claude-code/__tests__/fixtures.test.ts`

The oracle reads the raw fixture JSON with trivial loops (no parser code) so the assertions are independent of the implementation.

- [ ] **Step 1: Write the test**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeCodeSession } from "../index";

const FIXTURES = join(process.cwd(), "fixtures");

type Line = {
  type?: string;
  isSidechain?: boolean;
  message?: { id?: string; content?: unknown; usage?: Record<string, number> };
};

function loadDir(name: string) {
  const dir = join(FIXTURES, name);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
  const raw: Line[] = files.flatMap((f) =>
    f.text.split("\n").filter(Boolean).map((row) => JSON.parse(row) as Line)
  );
  return { files, raw };
}

/** Counts computed straight from raw JSON. */
function oracle(raw: Line[]) {
  let toolUse = 0;
  let toolResult = 0;
  let outputTokens = 0;
  let inputTokens = 0;
  const seen = new Set<string>();
  for (const l of raw) {
    const blocks = Array.isArray(l.message?.content) ? (l.message!.content as { type: string }[]) : [];
    for (const b of blocks) {
      if (b.type === "tool_use") toolUse++;
      if (b.type === "tool_result") toolResult++;
    }
    if (l.type === "assistant" && l.message?.usage) {
      const id = l.message.id ?? `anon-${seen.size}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const u = l.message.usage;
      outputTokens += u.output_tokens ?? 0;
      inputTokens += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    }
  }
  return { toolUse, toolResult, outputTokens, inputTokens };
}

const dirs = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

describe.each(dirs)("fixture %s", (name) => {
  const { files, raw } = loadDir(name);
  const { trace, warnings } = parseClaudeCodeSession(files);
  const expected = oracle(raw);

  it("produces steps with unique ids in chronological order", () => {
    expect(trace.steps.length).toBeGreaterThan(10);
    expect(new Set(trace.steps.map((s) => s.id)).size).toBe(trace.steps.length);
    for (let i = 1; i < trace.steps.length; i++) {
      expect(Date.parse(trace.steps[i].at)).toBeGreaterThanOrEqual(Date.parse(trace.steps[i - 1].at));
      expect(trace.steps[i].index).toBe(i);
    }
    expect(trace.steps.every((s) => (s.durationMs ?? 0) >= 0)).toBe(true);
  });

  it("emits one tool_call per tool_use block and one tool_result per tool_result block", () => {
    expect(trace.steps.filter((s) => s.kind === "tool_call")).toHaveLength(expected.toolUse);
    expect(trace.steps.filter((s) => s.kind === "tool_result")).toHaveLength(expected.toolResult);
    expect(trace.totals.toolCalls).toBe(expected.toolUse);
  });

  it("pairs every tool_result to a tool_call", () => {
    const callIds = new Set(trace.steps.filter((s) => s.kind === "tool_call").map((s) => s.tool!.callId));
    const orphans = trace.steps.filter((s) => s.kind === "tool_result" && !callIds.has(s.result!.callId));
    expect(orphans).toEqual([]);
    expect(warnings.filter((w) => w.includes("no matching tool_call"))).toEqual([]);
  });

  it("sums tokens once per message id", () => {
    expect(trace.totals.outputTokens).toBe(expected.outputTokens);
    expect(trace.totals.inputTokens).toBe(expected.inputTokens);
    expect(trace.totals.outputTokens).toBeGreaterThan(0);
  });

  it("has a title, model, and a positive duration", () => {
    expect(trace.title).not.toBe("Untitled session");
    expect(trace.title.length).toBeLessThanOrEqual(80);
    expect(trace.model).toMatch(/^claude/);
    expect(trace.totals.durationMs).toBeGreaterThan(0);
    expect(Date.parse(trace.endedAt) - Date.parse(trace.startedAt)).toBe(trace.totals.durationMs);
  });

  it("links subagent files to their Agent call", () => {
    const hasSub = files.some((f) => f.name.startsWith("agent-"));
    const subSteps = trace.steps.filter((s) => s.agent !== "main");
    if (!hasSub) {
      expect(subSteps).toEqual([]);
      return;
    }
    expect(subSteps.length).toBeGreaterThan(0);
    expect(subSteps.every((s) => s.parentId !== undefined)).toBe(true);
    expect(warnings.filter((w) => w.includes("no matching Agent call"))).toEqual([]);
  });

  it("does not emit meta or command-echo user steps", () => {
    const users = trace.steps.filter((s) => s.kind === "user");
    expect(users.some((s) => /^<command-|^<local-command-|^<system-reminder/.test(s.text ?? ""))).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

```bash
cd /Users/yarin/Projects/tracecast && npm test
```

Expected: all pass. Likely real-world failures and what they mean:

- `pairs every tool_result` fails: the fixture has a tool_result whose call is in a line the script dropped, or a subagent result. Inspect the orphan's `callId` with `grep -c <callId> fixtures/<name>/*.jsonl`. If the call really is absent from the session (happens after `/clear` or compaction), relax that one test to allow orphans only when a `system` "Context compacted" step exists earlier. Otherwise fix the parser.
- `links subagent files` fails with "no matching Agent call": check that `toolUseResult.agentId` survived stripping (`grep -c agentId fixtures/<name>/main.jsonl`). If a subagent file has no `agentId` field, the fallback to the filename should handle it.
- `has a title` fails on `model`: no assistant line in the main file has a real `message.model` (only `<synthetic>` or none). The fixture is odd, pick another.
- `sums tokens` fails: check `warnings` for "had usage but no content". If present the parser folded those tokens in and the oracle should still match, so the mismatch is elsewhere: diff per message id by logging both sides.

- [ ] **Step 3: Commit**

```bash
cd /Users/yarin/Projects/tracecast
git add lib/trace/parsers/claude-code/__tests__/fixtures.test.ts && git commit -m "test(parser): fixture invariants against raw JSON oracle"
```

---

### Task 10: Dev page that dumps the parsed Trace

**Files:**
- Create: `app/dev/parse/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useState } from "react";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult } from "@/lib/trace/types";

const PREVIEW_STEPS = 500;

export default function DevParsePage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const files = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() }))
    );
    const t0 = performance.now();
    const parsed = parseClaudeCodeSession(files);
    setMs(Math.round(performance.now() - t0));
    setResult(parsed);
    setBusy(false);
  }

  const trace = result?.trace;
  const preview = trace ? { ...trace, steps: trace.steps.slice(0, PREVIEW_STEPS) } : null;

  return (
    <main className="min-h-screen p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg font-bold">Tracecast dev: parse</h1>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
        className="rounded border border-dashed border-neutral-400 p-12 text-center"
      >
        <p>Drop a session .jsonl here (add its agent-*.jsonl files too, if any)</p>
        <input
          type="file"
          multiple
          accept=".jsonl"
          onChange={(e) => void handleFiles(e.target.files)}
          className="mx-auto mt-4 block"
        />
      </div>

      {busy && <p className="mt-4">Parsing...</p>}

      {result && trace && (
        <>
          <h2 className="mt-8 font-bold">Summary ({ms} ms)</h2>
          <pre className="mt-2 rounded bg-neutral-100 p-4 dark:bg-neutral-900">
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
          <pre className="mt-2 max-h-[70vh] overflow-auto rounded bg-neutral-100 p-4 dark:bg-neutral-900">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Add `.claude/launch.json` at the repo root:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "tracecast", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

Start the preview (`preview_start` with name `tracecast`), open `http://localhost:3000/dev/parse`, pick `fixtures/long/main.jsonl` plus its `agent-*.jsonl` files via the file input. Confirm: summary shows the expected step count, agents list includes more than `main`, warnings are few, and the console has no errors. Take a screenshot for the chunk summary.

- [ ] **Step 3: Lint, type-check, test, commit**

```bash
cd /Users/yarin/Projects/tracecast && npm run lint && npx tsc --noEmit && npm test
git add app/dev/parse/page.tsx .claude/launch.json && git commit -m "feat(dev): page that parses dropped session files and dumps the Trace"
```

---

### Task 11: Chunk wrap-up

- [ ] **Step 1: README stub**

Create `README.md`:

```md
# Tracecast

Turn a Claude Code session into a polished, shareable animated replay.

## Dev

    npm install
    npm run dev          # http://localhost:3000/dev/parse
    npm test

## Fixtures

Real sessions, stripped and redacted with `npm run fixture -- <session.jsonl> <name>`.
Review the output before committing; see docs/superpowers/plans for the checklist.
```

- [ ] **Step 2: Commit and report**

```bash
cd /Users/yarin/Projects/tracecast && git add README.md && git commit -m "docs: README stub"
```

Stop here. Summarize the chunk in a few bullets for Yarin (per the handoff rules) and wait for the go-ahead on chunk 2.

---

## Roadmap for later chunks (each gets its own plan file)

Decisions made now so they are not re-litigated:

- **Chunk 2 (static timeline):** `/` drop zone reuses the dev page's multi-file `handleFiles`. Timeline reads only `Trace`. Virtualize with `@tanstack/react-virtual` when steps exceed 300. Subagent steps render indented under their parent `tool_call` (via `parentId`).
- **Chunk 3 (replay):** needs motion-lab `dist-spec/` copied to this Mac first. Playback clock maps each step's `durationMs` through a cap (e.g. max 1.5 s of playback per gap) and a global scale so total playback lands near 60 s. Token counter animates `totals` cumulatively from `steps[i].tokens`.
- **Chunk 4 (share):** redaction UI reuses `lib/trace/secrets.ts` (`SECRET_PATTERNS`) to auto-flag, plus a path pattern for absolute paths. Uploads the normalized `Trace` JSON only.
- **Chunk 5 and 6:** as in the handoff.
