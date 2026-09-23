import { demoTrace } from "@/lib/demo";
import { OG_SIZE, renderTraceCard } from "@/lib/share/og-card";

export const alt = "Tracecast demo replay card";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderTraceCard(demoTrace);
}
