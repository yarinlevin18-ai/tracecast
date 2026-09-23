import { ImageResponse } from "next/og";
import { loadSharedTrace } from "@/lib/share/load";
import { OG_SIZE, ogFrame, renderTraceCard } from "@/lib/share/og-card";

// Cached per id for five minutes. Shares only change by expiring, and expiry is measured in days, so a briefly stale card is fine.
export const revalidate = 300;
export const alt = "Tracecast replay";
export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { params: Promise<{ id: string }> };

export default async function Image({ params }: Params) {
  const { id } = await params;
  const trace = await loadSharedTrace(id);

  if (!trace) {
    return new ImageResponse(
      (
        <div style={{ ...ogFrame, alignItems: "center", justifyContent: "center", fontSize: 40, color: "#a1a1aa" }}>
          Replay not found
        </div>
      ),
      size
    );
  }
  return renderTraceCard(trace);
}
