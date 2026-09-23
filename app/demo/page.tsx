import type { Metadata } from "next";
import { EmbedReplay } from "@/components/embed/EmbedReplay";
import { demoTrace as trace } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Demo replay | Tracecast",
  description: "A real Claude Code session, replayed.",
};

type Props = { searchParams: Promise<{ autoplay?: string | string[] }> };

export default async function DemoPage({ searchParams }: Props) {
  const { autoplay } = await searchParams;
  return <EmbedReplay trace={trace} shareUrl="/app" linkLabel="Replay your own session" autoplay={autoplay === "1"} />;
}
