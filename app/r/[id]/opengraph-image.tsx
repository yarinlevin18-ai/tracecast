import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { loadSharedTrace } from "@/lib/share/load";
import { clampTitle, describeTrace, KIND_COLORS, kindStrip } from "@/lib/share/og";
import { formatDuration, formatTokens } from "@/lib/trace/format";

export const dynamic = "force-dynamic";
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
    `${trace.totals.toolCalls} tool calls`,
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
          <div style={{ fontSize: 22, color: "#71717a" }}>{trace.steps.length} steps</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 56 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#fafafa" }}>{clampTitle(trace.title, 90)}</div>
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
          <div style={{ fontSize: 20, color: "#71717a" }}>{describeTrace(trace)}</div>
        </div>
      </div>
    ),
    size
  );
}
