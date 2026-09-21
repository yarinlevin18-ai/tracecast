import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SharingNotConfigured extends Error {
  constructor() {
    super("Sharing is not configured on this server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).");
    this.name = "SharingNotConfigured";
  }
}

let cached: SupabaseClient | null = null;

/** Service role client for route handlers and server components only. */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SharingNotConfigured();
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
