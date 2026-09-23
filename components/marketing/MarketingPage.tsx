import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Code2, FastForward, GitBranch, Link2, ShieldCheck, UploadCloud } from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { demoReplayMs, demoTrace } from "@/lib/demo";
import { KIND_COLORS, kindStrip } from "@/lib/share/og";
import { SITE, siteUrl } from "@/lib/site";
import { formatDuration, formatTokens } from "@/lib/trace/format";
import { redactText } from "@/lib/trace/secrets";

// Radius rule for this page: surfaces are rounded-2xl, buttons and chips are rounded-full, code is rounded-lg.

const CTA_PRIMARY =
  "inline-flex items-center gap-2 rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 active:scale-[0.98]";
const CTA_SECONDARY =
  "inline-flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50 active:scale-[0.98]";

const STATS = [
  { value: String(demoTrace.steps.length), label: "steps in the demo session" },
  { value: String(demoTrace.totals.toolCalls), label: "tool calls resolved in order" },
  { value: formatTokens(demoTrace.totals.inputTokens), label: "input tokens, counted live" },
  { value: formatDuration(demoReplayMs), label: `to watch ${formatDuration(demoTrace.totals.durationMs)} of work` },
];

const STEPS = [
  { Icon: UploadCloud, title: "Drop the session file", body: "Parsing runs in your browser, subagent files included. Nothing is uploaded yet." },
  { Icon: ShieldCheck, title: "Review what gets published", body: "Keys, tokens, emails and home paths are flagged and redacted. Edit or drop any step." },
  { Icon: Link2, title: "Share the link", body: "Pick an expiry and get a URL that plays the replay, unfurls with a card and embeds with one line." },
];

// Deliberately fake values, run through the real redaction patterns at render time.
const LEAKY = [
  "export API_KEY=sk-live9Qe2Lw7hTz4Kd81mXv",
  "git config user.email dana@studio.dev",
  "cd /Users/dana/code/checkout",
];

const EMBED = `<iframe src="${siteUrl}/embed/${SITE.demoShareId}"
  width="100%" height="520"></iframe>`;

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Unlimited replays in your browser", "Share links for 7 days, 30 days or forever", "Redaction review before upload", "Embeddable player and preview cards"],
    live: true,
  },
  {
    name: "Pro",
    price: "$12",
    period: "per month",
    features: ["Everything in Free", "Password-protected links", "Custom cover cards", "View counts per replay"],
    live: false,
  },
  {
    name: "Team",
    price: "$29",
    period: "per seat, per month",
    features: ["Everything in Pro", "Shared team library", "Org-wide redaction rules", "Single sign-on"],
    live: false,
  },
];

const FAQ = [
  {
    q: "Does my session get uploaded?",
    a: "Not unless you share it. Parsing happens in your browser. When you click Share, only the normalized replay is uploaded, after you have reviewed the redactions. The raw file never leaves your machine.",
  },
  {
    q: "Which agents are supported?",
    a: "Claude Code today, including subagent runs. Sessions are converted into a normalized trace format, so other agents can be added without touching the player.",
  },
  { q: "How long do share links last?", a: "You choose when you share: 7 days, 30 days or no expiry." },
  {
    q: "Can I put a replay in a blog post or a PR?",
    a: "Yes. Every shared replay comes with an iframe snippet, and the link unfurls with a preview card showing the title, model, totals and a mini timeline.",
  },
  { q: "Is it open source?", a: "Yes. The whole app, parser included, is on GitHub." },
];

export function MarketingPage() {
  const strip = kindStrip(demoTrace.steps, 56);

  return (
    <div className="relative flex-1 overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_50%_at_30%_0%,rgba(56,189,248,0.12),transparent_70%)]" />

      {/* z-20: the only stacked layer on this page. */}
      <header className="sticky top-0 z-20 border-b border-zinc-900/80 bg-zinc-950/75 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-zinc-100">
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-sky-400/15 text-sky-300">
              <FastForward className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            {SITE.name}
          </Link>
          <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#features" className="hover:text-zinc-100">Features</a>
            <a href="#pricing" className="hover:text-zinc-100">Pricing</a>
            <a href="#faq" className="hover:text-zinc-100">FAQ</a>
            <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-100">GitHub</a>
          </div>
          <Link href="/app" className="rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98]">
            Open app
          </Link>
        </nav>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
          <Reveal immediate className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-300">For Claude Code sessions</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tighter text-zinc-50 sm:text-5xl lg:text-6xl">{SITE.tagline}</h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-zinc-400">
              Turn a session file into an animated replay you can scrub, share as a link and embed anywhere.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/app" className={CTA_PRIMARY}>
                Open app <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link href="/demo" className={CTA_SECONDARY}>
                Watch the demo
              </Link>
            </div>
          </Reveal>

          <Reveal immediate delay={0.15} className="mt-14 sm:mt-16">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1.5 shadow-[0_40px_120px_-40px_rgba(56,189,248,0.25)]">
              <iframe
                src="/demo?autoplay=1"
                title="Tracecast replaying a real Claude Code session"
                className="h-[460px] w-full rounded-[12px] bg-zinc-950 sm:h-[600px]"
              />
            </div>
          </Reveal>
        </section>

        <section aria-label="The demo session in numbers" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="grid grid-cols-2 gap-x-6 gap-y-10 border-y border-zinc-900 py-10 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-mono text-3xl font-medium tracking-tight text-zinc-50 sm:text-4xl">{s.value}</div>
                <div className="mt-2 text-sm text-zinc-500">{s.label}</div>
              </div>
            ))}
          </Reveal>
        </section>

        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.3fr] md:gap-20">
          <Reveal className="md:sticky md:top-28 md:self-start">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">From session file to link in a minute.</h2>
            <p className="mt-4 max-w-[42ch] text-zinc-400">
              Claude Code already writes every run to <code className="rounded-lg bg-zinc-900 px-1.5 py-0.5 font-mono text-[13px] text-zinc-300">~/.claude/projects</code>. Tracecast reads it as is.
            </p>
          </Reveal>
          <ol className="grid grid-cols-1 gap-4">
            {STEPS.map(({ Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.08}>
                <li className="flex gap-5 rounded-2xl border border-zinc-900 bg-zinc-900/30 p-6">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-400/10 text-sky-300">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold text-zinc-100">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Built for showing work, not debugging it.</h2>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-[auto_auto_auto]">
            <Reveal className="md:col-span-2 md:row-span-2">
              <article className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950 p-6 sm:p-8">
                <h3 className="text-xl font-semibold text-zinc-50">Links that unfurl</h3>
                <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-zinc-400">
                  Every shared replay gets its own preview card with the title, model, totals and a timeline of the run. This one is generated from the demo.
                </p>
                <div className="mt-auto pt-8">
                  <Image
                    src="/demo/opengraph-image"
                    alt="The preview card generated for the demo replay"
                    width={1200}
                    height={630}
                    unoptimized
                    className="w-full rounded-lg border border-zinc-800"
                  />
                </div>
              </article>
            </Reveal>

            <Reveal delay={0.05}>
              <article className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <ShieldCheck className="h-5 w-5 text-sky-300" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3 font-semibold text-zinc-50">Redaction before upload</h3>
                <div className="mt-4 grid gap-2 font-mono text-[12px] leading-5">
                  {LEAKY.map((line) => (
                    <div key={line} className="rounded-lg bg-zinc-950 px-3 py-2">
                      <div className="truncate text-zinc-600 line-through decoration-zinc-700">{line}</div>
                      <div className="truncate text-zinc-200">{redactText(line)}</div>
                    </div>
                  ))}
                </div>
              </article>
            </Reveal>

            <Reveal delay={0.1}>
              <article className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <Code2 className="h-5 w-5 text-sky-300" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3 font-semibold text-zinc-50">One-line embed</h3>
                <p className="mt-1.5 text-sm text-zinc-400">Drop the player into a blog post, a doc or a PR.</p>
                <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11.5px] leading-5 text-zinc-300">{EMBED}</pre>
              </article>
            </Reveal>

            <Reveal delay={0.05}>
              <article className="h-full rounded-2xl border border-zinc-800 bg-[linear-gradient(160deg,rgba(56,189,248,0.10),transparent_60%)] p-6">
                <GitBranch className="h-5 w-5 text-sky-300" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3 font-semibold text-zinc-50">Subagents in the same timeline</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  Drop the agent files with the session and every subagent run is woven in where it happened.
                </p>
              </article>
            </Reveal>

            <Reveal delay={0.1} className="md:col-span-2">
              <article className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <FastForward className="h-5 w-5 text-sky-300" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3 font-semibold text-zinc-50">A clock that skips the waiting</h3>
                <p className="mt-1.5 max-w-[56ch] text-sm leading-relaxed text-zinc-400">
                  Long pauses are compressed so the replay moves at the pace of the work. Below is the demo session, one cell per slice.
                </p>
                <div className="mt-5 flex h-8 gap-[3px]" role="img" aria-label="Timeline of the demo session by step kind">
                  {strip.map((kind, i) => (
                    <div key={i} className="flex-1 rounded-[3px]" style={{ background: KIND_COLORS[kind], opacity: kind === "system" ? 0.45 : 0.85 }} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                  {(["user", "assistant", "tool_call", "subagent"] as const).filter((k) => strip.includes(k)).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLORS[k] }} />
                      {k === "tool_call" ? "tool" : k}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-300">Pricing</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Free for everything that exists today.</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.08}>
                <article
                  className={[
                    "flex h-full flex-col rounded-2xl border p-7",
                    plan.live ? "border-sky-400/40 bg-sky-400/[0.04]" : "border-zinc-800 bg-zinc-900/30",
                  ].join(" ")}
                >
                  <h3 className="font-semibold text-zinc-100">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-zinc-50">{plan.price}</span>
                    <span className="text-sm text-zinc-500">{plan.period}</span>
                  </div>
                  <ul className="mt-6 grid gap-3 text-sm text-zinc-300">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" strokeWidth={2} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8">
                    {plan.live ? (
                      <Link href="/app" className={`${CTA_PRIMARY} w-full justify-center`}>
                        Open app
                      </Link>
                    ) : (
                      <span className="inline-flex w-full justify-center rounded-full border border-zinc-800 px-5 py-2.5 text-sm text-zinc-500">
                        Coming soon
                      </span>
                    )}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-sm text-zinc-500">Tracecast is a portfolio project. Free works today; Pro and Team are a product concept.</p>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:px-6">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Questions</h2>
          </Reveal>
          <div className="mt-10 grid gap-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-zinc-900 bg-zinc-900/30 px-6 py-5 open:bg-zinc-900/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-zinc-100 [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
          <Reveal>
            <div className="rounded-2xl border border-zinc-800 bg-[radial-gradient(80%_120%_at_0%_0%,rgba(56,189,248,0.14),transparent_60%)] px-6 py-14 sm:px-12">
              <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Your last run is already on disk. Watch it back.</h2>
              <div className="mt-8">
                <Link href="/app" className={CTA_PRIMARY}>
                  Open app <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>{SITE.name}, built by Yarin Levin</span>
          <div className="flex gap-6">
            <Link href="/demo" className="hover:text-zinc-200">Demo</Link>
            <Link href="/app" className="hover:text-zinc-200">App</Link>
            <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
