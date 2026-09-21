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
