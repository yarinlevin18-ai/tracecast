import type { Metadata } from "next";
import { EmbedReplay } from "@/components/embed/EmbedReplay";
import demo from "@/lib/demo/trace.json";
import { validateTrace } from "@/lib/share/validate";

export const metadata: Metadata = {
  title: "Demo replay | Tracecast",
  description: "A real Claude Code session, replayed.",
};

// Validated once at module load; a bad file fails the build, not a request.
const trace = validateTrace(demo);

type Props = { searchParams: Promise<{ autoplay?: string | string[] }> };

export default async function DemoPage({ searchParams }: Props) {
  const { autoplay } = await searchParams;
  return <EmbedReplay trace={trace} shareUrl="/" linkLabel="Replay your own session" autoplay={autoplay === "1"} />;
}
