# Portfolio entry: Tracecast

Paste-ready copy for the "latest works" section. Replace the live URL if the Vercel project name differs.

## Card

**Tracecast**  
Replay your agent runs like a screen recording.

Drop a Claude Code session file and get a polished, animated replay with a shareable link, a preview card and an embeddable player. Parsing runs in the browser; a redaction review runs before anything is uploaded.

- Live: https://tracecast.vercel.app
- Demo: https://tracecast.vercel.app/demo
- Source: https://github.com/yarinlevin18-ai/tracecast
- Stack: Next.js 16, React 19, TypeScript, Tailwind, Motion, Supabase, Vercel OG
- Image: `docs/demo.gif` (animated) or a screenshot of `/demo`

## Longer blurb

Agent traces are usually read as debugging dashboards. Tracecast treats them as something to share: a session becomes a replay with a compressed clock, live token and tool-call counters, scrubbing and speed control. Sharing uploads a normalized trace to Supabase Storage behind a service role key, after a client-side pass that flags API keys, tokens, emails and home directory paths and lets you edit or drop steps. Every shared link gets an Open Graph card generated with `next/og` and an iframe embed.

## One-liners for social posts

- Loom for agent runs: turn a Claude Code session into a replay you can link, embed and unfurl.
- Watch an AI agent think, call tools and recover from errors, at 4x, in your browser.
