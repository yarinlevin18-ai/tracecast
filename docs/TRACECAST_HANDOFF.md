# Tracecast: Handoff for Timmy

Working name: **Tracecast** (rename later if needed).
Location: `D:\Yarin\Projects\tracecast`

## Goal
A web app that turns an AI agent trace file into a polished, animated replay with a shareable link and an embeddable player. Think "Loom for agent runs". Portfolio piece, so visual quality and polish matter as much as function.

## Context
- Existing tools (claude-trace-replay, parag-labs/agent-trace, rewind, telemetryZero) are debugging dashboards. Tracecast is about **sharing**: a replay that looks good in a tweet, a PR, or a blog post.
- v1 input: Claude Code session files (`.jsonl`). On Windows they live under `%USERPROFILE%\.claude\projects\<project-folder>\<session-id>.jsonl`.
- Animations use Yarin's motion-lab. Read the spec at `D:\Yarin\Projects\motion-lab\dist-spec\motion-lab-spec.json` and instructions at `D:\Yarin\Projects\motion-lab\dist-spec\MOTION_LAB.md`. Source of truth for animation work. Animations are applied last in each chunk.

## Stack
- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Framer Motion (via motion-lab patterns)
- Supabase (Postgres + Storage) for shared traces, from chunk 4 on
- Vercel for hosting and OG images (`next/og`)
- Parsing runs client-side. Nothing leaves the browser until the user clicks Share.

## Working rules
- Work in the chunks below, one at a time. Stop after each chunk, summarize what changed in a few bullets, and wait for Yarin's go-ahead.
- Explain only concepts that are new to Yarin. Keep responses short.
- No em dashes in generated text or code comments.
- Before building the parser, inspect real session files. Do not trust the format notes below blindly.

## Core data model (internal, format-agnostic)
Every input format gets parsed into this. The UI only ever reads this.

```ts
type Trace = {
  id: string;
  source: "claude-code" | "otel";      // otel comes later
  title: string;                        // first user prompt, truncated
  startedAt: string;                    // ISO
  endedAt: string;
  model?: string;
  totals: { inputTokens: number; outputTokens: number; toolCalls: number; durationMs: number };
  steps: Step[];
};

type Step = {
  id: string;
  parentId?: string;
  index: number;
  at: string;                           // ISO timestamp
  durationMs?: number;                  // time until next step
  kind: "user" | "assistant" | "thinking" | "tool_call" | "tool_result" | "subagent" | "system";
  agent: string;                        // "main" or subagent name
  text?: string;                        // message / thinking text
  tool?: { name: string; input: unknown; callId: string };
  result?: { callId: string; output: string; isError: boolean };
  tokens?: { input: number; output: number };
};
```

## Claude Code .jsonl format notes (VERIFY against real files)
Undocumented format that may change. Expected shape, from memory:
- One JSON object per line. Common fields: `type` (`user`, `assistant`, `summary`, others), `uuid`, `parentUuid`, `timestamp`, `sessionId`, `message`.
- `message.content` is a string or an array of blocks: `text`, `thinking`, `tool_use` (`id`, `name`, `input`), `tool_result` (`tool_use_id`, `content`, `is_error`).
- Tool results arrive inside `user`-type lines. Link them to calls via `tool_use_id`.
- Assistant usage is under `message.usage` (`input_tokens`, `output_tokens`, cache fields).
- One assistant turn may be split across several lines sharing the same `message.id`. Merge them and count usage once.
- Subagent lines may be flagged (e.g. `isSidechain`).

Parser rules: skip unknown line types without crashing, collect warnings, never throw on a single bad line.

## Chunks

### Chunk 1: Parser
- Scaffold the Next.js app.
- `lib/trace/types.ts` with the model above.
- `lib/trace/parsers/claude-code.ts`: `parseClaudeCode(text: string): { trace: Trace; warnings: string[] }`.
- 2 or 3 real sample sessions in `fixtures/` (ask Yarin which ones; strip anything sensitive first).
- Unit tests (Vitest) on the fixtures: step count, tool call/result pairing, token totals.
- **Done means:** tests pass, and a dev page dumps the parsed Trace as JSON for a dropped file.

### Chunk 2: Static timeline
- Drag-and-drop upload on `/`.
- Vertical timeline of steps with icons per kind, collapsible tool inputs/outputs, header with totals.
- No animation yet.
- **Done means:** any fixture renders readably, including long sessions (virtualize if over ~300 steps).

### Chunk 3: Animated replay (the core)
- Player with play/pause, scrub bar, speed (1x/2x/4x), step-to-step keyboard nav.
- Steps appear in sequence. Tool calls visibly "fire" and resolve. Token counter ticks up.
- Timing uses compressed real time (cap long gaps) so a 20-minute session plays in about 1 minute.
- Apply motion-lab patterns here.
- **Done means:** replay feels smooth at 60fps on a long fixture, and scrubbing jumps instantly.

### Chunk 4: Share
- Before upload: redaction screen. Auto-flag likely secrets (API keys, tokens, `.env` contents, emails) and absolute file paths, let the user edit or remove steps.
- Upload the normalized Trace JSON (not the raw file) to Supabase Storage, row in a `traces` table (`id`, `title`, `created_at`, `totals`, `storage_path`, `expires_at`).
- Share page at `/r/[id]`. Optional expiry.
- **Done means:** a shared link opens the replay in a fresh browser with no login.

### Chunk 5: Embed + previews
- `/embed/[id]`: minimal player for iframes.
- OG image per trace via `next/og` (title, model, totals, mini timeline).
- **Done means:** link preview looks good pasted into X, Slack, and WhatsApp.

### Chunk 6: Launch
- Landing page with a live demo replay.
- README with GIF, deploy to Vercel.
- Add to Yarin's portfolio "latest works" section.

## Later (not v1)
- OpenTelemetry GenAI trace import, so non-Claude agents work.
- Export replay as MP4/GIF.
- Run compare view.
