"use client";

import { useEffect } from "react";
import type { SessionFile } from "@/lib/trace/types";

export const FIXTURE_NAMES = ["short", "subagents", "long"] as const;
export const isDev = process.env.NODE_ENV === "development";

/**
 * Dev convenience: when the URL has ?fixture=<name>, fetch fixtures/<name>
 * from the dev-only route and hand the files to the caller.
 */
export function useFixtureParam(onFiles: (files: SessionFile[]) => void, onError: (msg: string) => void) {
  useEffect(() => {
    if (!isDev) return;
    const name = new URLSearchParams(window.location.search).get("fixture");
    if (!name) return;
    let cancelled = false;
    fetch(`/dev/fixtures/${encodeURIComponent(name)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`fixture "${name}" not found (${res.status})`);
        const files = (await res.json()) as SessionFile[];
        if (!cancelled) onFiles(files);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount; callers pass stable handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
