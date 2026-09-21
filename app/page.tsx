"use client";

import { useCallback, useState } from "react";
import { DropZone } from "@/components/trace/DropZone";
import { TopBar, type ViewMode } from "@/components/trace/TopBar";
import { TraceView } from "@/components/trace/TraceView";
import { ReplayView } from "@/components/replay/ReplayView";
import { ShareDialog } from "@/components/share/ShareDialog";
import { useFixtureParam } from "@/components/trace/useFixtureParam";
import { parseClaudeCodeSession } from "@/lib/trace/parsers/claude-code";
import type { ParseResult, SessionFile } from "@/lib/trace/types";

export default function Home() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("replay");
  const [sharing, setSharing] = useState(false);

  const parseFiles = useCallback((files: SessionFile[]) => {
    const parsed = parseClaudeCodeSession(files);
    if (parsed.trace.steps.length === 0) {
      setError("No steps found. Is this a Claude Code session .jsonl?");
      return;
    }
    setError(null);
    setResult(parsed);
  }, []);

  useFixtureParam(parseFiles, setError);

  if (result) {
    return (
      <>
        <TopBar
          mode={mode}
          onMode={setMode}
          onReset={() => {
            setResult(null);
            window.history.replaceState(null, "", "/");
          }}
          onShare={() => setSharing(true)}
        />
        {mode === "replay" ? <ReplayView trace={result.trace} /> : <TraceView result={result} />}
        {sharing && <ShareDialog trace={result.trace} onClose={() => setSharing(false)} />}
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Tracecast</h1>
      <p className="mt-2 mb-8 text-base text-zinc-400">Turn a Claude Code session into a polished, shareable replay.</p>
      <DropZone onFiles={parseFiles} error={error} />
    </main>
  );
}
