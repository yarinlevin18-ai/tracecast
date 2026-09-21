import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedReplay } from "@/components/embed/EmbedReplay";
import { loadSharedTrace } from "@/lib/share/load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ autoplay?: string | string[] }> };

export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ id }, { autoplay }] = await Promise.all([params, searchParams]);
  const trace = await loadSharedTrace(id);
  if (!trace) notFound();
  return <EmbedReplay trace={trace} shareUrl={`/r/${id}`} autoplay={autoplay === "1"} />;
}
