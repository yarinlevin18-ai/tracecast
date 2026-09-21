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

// The owner's login shows up as a bare word in ls output; the path patterns miss it.
const LOGIN = /\byarin\b/gi;

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactText(value).replace(LOGIN, "dev");
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const obj = value as Obj;
    if (obj.type === "image") return { type: "image" };
    const out: Obj = {};
    for (const [k, v] of Object.entries(obj)) {
      if (obj.type === "thinking" && k === "signature") continue;
      out[k] = redactDeep(v);
    }
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
  if (!line || typeof line !== "object") return null;
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
