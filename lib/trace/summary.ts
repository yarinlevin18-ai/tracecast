import type { Step } from "./types";

type Tool = NonNullable<Step["tool"]>;
const MAX = 80;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** One-line label for a tool call, used in timeline rows. */
export function toolSummary(tool: Tool): string {
  const input = asRecord(tool.input);
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
