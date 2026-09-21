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
