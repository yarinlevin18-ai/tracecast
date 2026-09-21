import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { loadSharedTrace } from "@/lib/share/load";
import { clampTitle, footerLine, KIND_COLORS, kindStrip, toolCallsLabel } from "@/lib/share/og";
import { formatDuration, formatTokens } from "@/lib/trace/format";

// Cached per id for five minutes. Shares only change by expiring, and expiry is measured in days, so a briefly stale card is fine.
export const revalidate = 300;
export const alt = "Tracecast replay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CELLS = 60;

const frame: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 64,
  background: "linear-gradient(135deg, #09090b 0%, #111114 100%)",
  color: "#fafafa",
  fontFamily: "sans-serif",
};

type Params = { params: Promise<{ id: string }> };

export default async function Image({ params }: Params) {
  const { id } = await params;
  const trace = await loadSharedTrace(id);

  if (!trace) {
    return new ImageResponse(
      (
        <div style={{ ...frame, alignItems: "center", justifyContent: "center", fontSize: 40, color: "#a1a1aa" }}>
          Replay not found
        </div>
      ),
      size
    );
  }

  const chips = [
    trace.model,
    formatDuration(trace.totals.durationMs),
    `${formatTokens(trace.totals.inputTokens)} in`,
    `${formatTokens(trace.totals.outputTokens)} out`,
    toolCallsLabel(trace.totals.toolCalls),
  ].filter((c): c is string => Boolean(c));
  const strip = kindStrip(trace.steps, CELLS);

  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: "#d4d4d8" }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#38bdf8" }} />
            Tracecast
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 56 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#fafafa", maxWidth: 1072, overflow: "hidden", wordBreak: "break-all" }}>{clampTitle(trace.title, 90)}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: "1px solid #27272a",
                  background: "rgba(24,24,27,0.7)",
                  fontSize: 24,
                  color: "#d4d4d8",
                  maxWidth: 1072,
                  overflow: "hidden",
                }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto" }}>
          <div style={{ display: "flex", gap: 4, height: 44 }}>
            {strip.map((kind, i) => (
              <div key={i} style={{ flex: 1, borderRadius: 4, background: KIND_COLORS[kind], opacity: kind === "system" ? 0.5 : 0.9 }} />
            ))}
          </div>
          <div style={{ fontSize: 20, color: "#71717a" }}>{footerLine(trace)}</div>
        </div>
      </div>
    ),
    size
  );
}
