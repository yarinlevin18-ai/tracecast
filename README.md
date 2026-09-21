# Tracecast

Turn a Claude Code session into a polished, shareable animated replay.

## Dev

    npm install
    npm run dev          # http://localhost:3000  (dev: /?fixture=long)
    npm test

Replay: space plays, arrows step, 1/2/4 set speed.

## Fixtures

Real sessions, stripped and redacted with `npm run fixture -- <session.jsonl> <name>`.
Review the output before committing; see docs/superpowers/plans for the checklist.

## Sharing

Share links need a Supabase project. Apply `supabase/migrations/0001_traces.sql`
(dashboard SQL editor, or `supabase link` then `supabase db push`), then copy
`.env.example` to `.env.local` and fill in the URL and service role key. Without
them the app works but the Share button reports that sharing is not configured.
