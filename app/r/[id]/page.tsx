import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReplay } from "@/components/share/SharedReplay";
import { loadSharedTrace } from "@/lib/share/load";
import { describeTrace } from "@/lib/share/og";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const trace = await loadSharedTrace(id);
  if (!trace) {
    return {
      title: "Replay not found | Tracecast",
      description: "This Tracecast replay has expired or never existed.",
      robots: { index: false, follow: false },
      openGraph: { title: "Replay not found", siteName: "Tracecast" },
    };
  }
  const title = `${trace.title} | Tracecast`;
  const description = describeTrace(trace);
  return {
    title,
    description,
    // Shared links are unlisted; keep them out of search engines.
    robots: { index: false, follow: false },
    openGraph: { title: trace.title, description, siteName: "Tracecast", type: "website", url: `/r/${id}` },
    twitter: { card: "summary_large_image", title: trace.title, description, images: [`/r/${id}/opengraph-image`] },
  };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  const trace = await loadSharedTrace(id);
  if (!trace) notFound();
  return <SharedReplay trace={trace} />;
}
