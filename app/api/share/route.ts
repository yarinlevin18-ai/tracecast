import { NextResponse } from "next/server";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";
import { uploadTrace, type StoreClient } from "@/lib/share/store";
import { checkAndRecordShare, hashIp, type LimitClient } from "@/lib/share/ratelimit";
import { MAX_TRACE_BYTES, ValidationError, validateTrace } from "@/lib/share/validate";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXPIRY_CHOICES = new Set([7, 30]);

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_TRACE_BYTES) {
    return NextResponse.json({ error: "trace is too large to share" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const { trace: rawTrace, expiresInDays = null } = (body ?? {}) as { trace?: unknown; expiresInDays?: unknown };
  if (expiresInDays !== null && !(typeof expiresInDays === "number" && EXPIRY_CHOICES.has(expiresInDays))) {
    return NextResponse.json({ error: "expiresInDays must be 7, 30 or null" }, { status: 400 });
  }

  // The content-length check above catches most oversized bodies; validateTrace is the backstop.
  let trace;
  try {
    trace = validateTrace(rawTrace);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let client: StoreClient;
  try {
    // SupabaseClient's generic builder types do not line up with the narrow StoreClient slice.
    client = getAdminClient() as unknown as StoreClient;
  } catch (err) {
    if (err instanceof SharingNotConfigured) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }

  // Vercel sets x-real-ip from the connection and rewrites x-forwarded-for, so
  // neither can be spoofed there; behind another proxy, check its behaviour.
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await checkAndRecordShare(client as unknown as LimitClient, hashIp(ip, process.env.SHARE_IP_SALT || "tracecast"));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many shares from this network. Try again in an hour." }, { status: 429 });
  }

  try {
    const { id, expiresAt } = await uploadTrace(client, trace, { expiresInDays });
    const url = new URL(`/r/${id}`, req.url).toString();
    return NextResponse.json({ id, url, expiresAt }, { status: 201 });
  } catch (err) {
    console.error("share upload failed", err);
    return NextResponse.json({ error: "upload failed, try again" }, { status: 502 });
  }
}
