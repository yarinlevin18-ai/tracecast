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
