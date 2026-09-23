import { demoTrace } from "@/lib/demo";
import { SITE } from "@/lib/site";
import { OG_SIZE, renderTraceCard } from "@/lib/share/og-card";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderTraceCard(demoTrace, SITE.tagline);
}
