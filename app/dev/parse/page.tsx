"use client";

import { useCallback, useState } from "react";
import { DropZone } from "@/components/trace/DropZone";
import { useFixtureParam } from "@/components/trace/useFixtureParam";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

const PREVIEW_STEPS = 500;

export default function DevParsePage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const parseFiles = useCallback((files: SessionFile[]) => {
    const t0 = performance.now();
    const parsed = parseClaudeCodeSession(files);
    setMs(Math.round(performance.now() - t0));
    setResult(parsed);
    setError(null);
  }, []);

  useFixtureParam(parseFiles, setError);

  const trace = result?.trace;
  const preview = trace ? { ...trace, steps: trace.steps.slice(0, PREVIEW_STEPS) } : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg font-bold">Tracecast dev: parse</h1>
      <DropZone onFiles={parseFiles} error={error} />

      {result && trace && (
        <>
          <h2 className="mt-8 font-bold">Summary ({ms} ms)</h2>
          <pre className="mt-2 rounded bg-zinc-900 p-4">
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
          <pre className="mt-2 max-h-[70vh] overflow-auto rounded bg-zinc-900 p-4">{JSON.stringify(preview, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
