import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/** Dev-only: serve fixtures/<name>/*.jsonl so /dev/parse?fixture=<name> can load them. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const { name } = await ctx.params;
  if (!/^[a-z0-9-]+$/i.test(name)) return new NextResponse(null, { status: 400 });
  const dir = join(process.cwd(), "fixtures", name);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const files = await Promise.all(
    entries
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .map(async (f) => ({ name: f, text: await readFile(join(dir, f), "utf8") }))
  );
  return NextResponse.json(files);
}
