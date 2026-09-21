"use client";

import { useEffect, useState } from "react";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

const PREVIEW_STEPS = 500;

export default function DevParsePage() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function parseFiles(files: SessionFile[]) {
    const t0 = performance.now();
    const parsed = parseClaudeCodeSession(files);
    setMs(Math.round(performance.now() - t0));
    setResult(parsed);
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    const files = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() }))
    );
    parseFiles(files);
    setBusy(false);
  }

  // Dev convenience: /dev/parse?fixture=long loads fixtures/long/*.jsonl from the dev server.
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("fixture");
    if (!name) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        setBusy(true);
        setError(null);
        return fetch(`/dev/fixtures/${encodeURIComponent(name)}`);
      })
      .then(async (res) => {
        if (!res.ok) throw new Error(`fixture "${name}" not found (${res.status})`);
        const files = (await res.json()) as SessionFile[];
        if (!cancelled) parseFiles(files);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <p className="mt-4 text-neutral-500">
          Or load a fixture:{" "}
          {["short", "subagents", "long"].map((name) => (
            <a key={name} href={`/dev/parse?fixture=${name}`} className="mx-1 underline">
              {name}
            </a>
          ))}
        </p>
      </div>

      {busy && <p className="mt-4">Parsing...</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

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
