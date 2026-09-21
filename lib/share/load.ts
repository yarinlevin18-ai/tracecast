import "server-only";
import { cache } from "react";
import { loadTrace, type StoreClient } from "@/lib/share/store";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";
import type { Trace } from "@/lib/trace/types";

/**
 * Loads a shared trace once per request; the page, its metadata and the OG
 * image all call this. Null when the share is missing, expired or sharing is
 * not configured.
 */
export const loadSharedTrace = cache(async (id: string): Promise<Trace | null> => {
  try {
    // SupabaseClient's generic builder types do not line up with the narrow StoreClient slice.
    return await loadTrace(getAdminClient() as unknown as StoreClient, id);
  } catch (err) {
    if (err instanceof SharingNotConfigured) return null;
    throw err;
  }
});
