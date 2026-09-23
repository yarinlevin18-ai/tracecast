"use client";

import { useCallback, useState } from "react";
import { UploadScreen } from "@/components/trace/UploadScreen";
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
            window.history.replaceState(null, "", "/app");
          }}
          onShare={() => setSharing(true)}
        />
        {mode === "replay" ? <ReplayView trace={result.trace} /> : <TraceView result={result} />}
        {sharing && <ShareDialog trace={result.trace} onClose={() => setSharing(false)} />}
      </>
    );
  }

  return <UploadScreen onFiles={parseFiles} error={error} />;
}
