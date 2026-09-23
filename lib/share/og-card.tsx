import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { clampTitle, footerLine, KIND_COLORS, kindStrip, toolCallsLabel } from "@/lib/share/og";
import { formatDuration, formatTokens } from "@/lib/trace/format";
import type { Trace } from "@/lib/trace/types";

export const OG_SIZE = { width: 1200, height: 630 };

const CELLS = 60;

export const ogFrame: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 64,
  background: "linear-gradient(135deg, #09090b 0%, #111114 100%)",
  color: "#fafafa",
  fontFamily: "sans-serif",
};

/** The 1200x630 preview card for a trace. `title` overrides the trace title (the landing page card uses the tagline). */
export function renderTraceCard(trace: Trace, title: string = trace.title): ImageResponse {
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
      <div style={ogFrame}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: "#d4d4d8" }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#38bdf8" }} />
            Tracecast
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 56 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#fafafa", maxWidth: 1072, overflow: "hidden", wordBreak: "break-word" }}>{clampTitle(title, 90)}</div>
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
    OG_SIZE
  );
}
