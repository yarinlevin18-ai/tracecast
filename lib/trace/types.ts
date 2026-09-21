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
  /**
   * `input` is input_tokens + cache_creation_input_tokens + cache_read_input_tokens,
   * i.e. the total context the model read for that turn - cached reads dominate
   * real sessions, and counting only input_tokens would show numbers like 2 per turn.
   */
  tokens?: { input: number; output: number };
};

/** A Step before ordering: no index or duration yet. */
export type DraftStep = Omit<Step, "index" | "durationMs">;

export type ParseResult = { trace: Trace; warnings: string[] };

/** One dropped file. `name` is used to tell main from agent-*.jsonl files. */
export type SessionFile = { name: string; text: string };
