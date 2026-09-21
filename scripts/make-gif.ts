import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

/**
 * Usage: npm run gif -- http://localhost:3000 [seconds]
 * Records /demo?autoplay=1 with the installed Google Chrome and converts the
 * video to docs/demo.gif with ffmpeg.
 */
async function main() {
  const base = process.argv[2] ?? "http://localhost:3000";
  const seconds = Number(process.argv[3] ?? 12);
  const outDir = "docs";
  const tmpDir = join(outDir, ".video");
  mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: tmpDir, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  await page.goto(`${base}/demo?autoplay=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(seconds * 1000);
  await context.close();
  await browser.close();

  const webm = readdirSync(tmpDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video recorded");
  const video = join(outDir, "demo.webm");
  renameSync(join(tmpDir, webm), video);
  rmSync(tmpDir, { recursive: true, force: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      video,
      "-vf",
      "fps=8,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
      "-loop",
      "0",
      join(outDir, "demo.gif"),
    ],
    { stdio: "inherit" }
  );
  console.log("wrote docs/demo.gif");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
