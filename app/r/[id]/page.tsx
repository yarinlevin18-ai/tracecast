import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SharedReplay } from "@/components/share/SharedReplay";
import { loadTrace, type StoreClient } from "@/lib/share/store";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => {
  try {
    return await loadTrace(getAdminClient() as unknown as StoreClient, id);
  } catch (err) {
    if (err instanceof SharingNotConfigured) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const trace = await load(id);
  return trace ? { title: `${trace.title} | Tracecast` } : { title: "Replay not found | Tracecast" };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  const trace = await load(id);
  if (!trace) notFound();
  return <SharedReplay trace={trace} />;
}
