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
