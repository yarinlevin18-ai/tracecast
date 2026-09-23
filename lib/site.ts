export const SITE = {
  name: "Tracecast",
  tagline: "Replay your agent runs like a screen recording.",
  description: "Turn a Claude Code session into a polished, animated replay with a shareable link and an embeddable player.",
  /** A public share of the demo trace, used in the landing page embed snippet. */
  demoShareId: "KeP7sjPiFxIh",
  github: "https://github.com/yarinlevin18-ai/tracecast",
};

/**
 * Public origin for absolute URLs (Open Graph, embed snippets). An explicit
 * metadataBase overrides Next's own Vercel URL fallback, so it is replicated here.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
