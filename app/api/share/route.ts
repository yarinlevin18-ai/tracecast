import { NextResponse } from "next/server";
import { getAdminClient, SharingNotConfigured } from "@/lib/supabase/admin";
import { uploadTrace, type StoreClient } from "@/lib/share/store";
import { ValidationError, validateTrace } from "@/lib/share/validate";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXPIRY_CHOICES = new Set([7, 30]);

export async function POST(req: Request) {
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

  // Bodies above MAX_TRACE_BYTES fail inside validateTrace, which is the effective size cap.
  let trace;
  try {
    trace = validateTrace(rawTrace);
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let client: StoreClient;
  try {
    client = getAdminClient() as unknown as StoreClient;
  } catch (err) {
    if (err instanceof SharingNotConfigured) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
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
