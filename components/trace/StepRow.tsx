"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, X } from "lucide-react";
import { formatOffset, formatTokens } from "@/lib/trace/format";
import { toolSummary } from "@/lib/trace/summary";
import type { TimelineRow } from "@/lib/trace/timeline";
import { enterAnimate, enterInitial, enterTransition, pulseAnimate, pulseTransition } from "@/components/replay/motion";
import { StepIcon } from "./StepIcon";

const LONG_TEXT = 1200;
/** Tool payloads and thinking blocks past this many chars need a click to render fully. */
const PANEL_MAX = 20000;

export type ToolStatus = "pending" | "done" | "error";

type Props = {
  row: TimelineRow;
  startedAt: string;
  /** Replay: this row is the current step. */
  active?: boolean;
  /** Replay: animate the row in on mount. */
  enter?: boolean;
  /** Replay: tool call state; undefined in the static timeline. */
  status?: ToolStatus;
};

export function StepRow({ row, startedAt, active = false, enter = false, status }: Props) {
  const { step, depth } = row;
  const reduced = useReducedMotion();
  const offset = formatOffset(Math.max(0, Date.parse(step.at) - Date.parse(startedAt)));
  const animateIn = enter && !reduced;

  return (
    <motion.article
      initial={animateIn ? enterInitial : false}
      animate={animateIn ? enterAnimate : undefined}
      transition={enterTransition}
      className={`relative flex gap-4 py-3 ${depth === 1 ? "pl-10" : ""}`}
      data-kind={step.kind}
      data-depth={depth}
      data-active={active || undefined}
      data-step-index={step.index}
    >
      <div className="relative flex w-6 shrink-0 justify-center">
        <span className="absolute top-0 bottom-0 w-px bg-zinc-800" aria-hidden />
        <span className={`relative mt-1 rounded-full bg-zinc-950 p-1 ${active ? "ring-2 ring-zinc-500/60" : ""}`}>
          <StepIcon kind={step.kind} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          {depth === 1 && (
            <span className="rounded bg-pink-400/10 px-1.5 py-0.5 text-[11px] font-medium text-pink-300">{step.agent}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-600">
            {step.tokens?.output ? `${formatTokens(step.tokens.output)} out  ` : ""}
            {offset}
          </span>
        </div>
        <Body row={row} status={status} />
      </div>
    </motion.article>
  );
}

function Body({ row, status }: { row: TimelineRow; status?: ToolStatus }) {
  const { step } = row;
  switch (step.kind) {
    case "thinking":
      return <Collapsible label="Thinking" summary={`${(step.text ?? "").length} chars`} muted>{step.text ?? ""}</Collapsible>;
    case "tool_call":
      return <ToolBody row={row} status={status} />;
    case "tool_result":
      return <Output output={step.result?.output ?? ""} isError={step.result?.isError ?? false} />;
    case "system":
      return <p className="text-xs text-zinc-500">{step.text}</p>;
    default:
      return <LongText text={step.text ?? ""} className={step.kind === "user" ? "text-zinc-100" : "text-zinc-300"} />;
  }
}

function ToolStatusMark({ status }: { status?: ToolStatus }) {
  if (status === "pending") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
        <motion.span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
          animate={pulseAnimate}
          transition={pulseTransition}
          aria-hidden
        />
        running
      </span>
    );
  }
  if (status === "done") return <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="Completed" role="img" />;
  if (status === "error") return <X className="h-3.5 w-3.5 text-red-400" aria-label="Failed" role="img" />;
  return null;
}

function ToolBody({ row, status }: { row: TimelineRow; status?: ToolStatus }) {
  const { step, result } = row;
  const [open, setOpen] = useState(false);
  if (!step.tool) return null;
  const tool = step.tool;
  const summary = toolSummary(tool);
  return (
    <div>
      <button
        type="button"
        aria-label={`${tool.name} details`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-baseline gap-2 text-left"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 self-center text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <span className="font-medium text-amber-300">{tool.name}</span>
        {summary && <span className="truncate font-mono text-xs text-zinc-400">{summary}</span>}
        <ToolStatusMark status={status} />
        {result?.isError && status !== "pending" && <span className="rounded bg-red-400/10 px-1.5 text-[11px] text-red-300">failed</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Panel title="Input">{JSON.stringify(tool.input, null, 2) ?? "{}"}</Panel>
          {result && (
            <Panel title="Output" isError={result.isError}>
              {result.output}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, isError = false }: { title: string; children: string; isError?: boolean }) {
  return (
    <div className={`rounded-lg border ${isError ? "border-red-900/60" : "border-zinc-800"} bg-zinc-900/60`}>
      <p className="border-b border-zinc-800 px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-500">{title}</p>
      <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-zinc-300">
        <Capped text={children} />
      </pre>
    </div>
  );
}

function Output({ output, isError }: { output: string; isError: boolean }) {
  return <Panel title={isError ? "Output (failed)" : "Output"} isError={isError}>{output}</Panel>;
}

function Collapsible({ label, summary, muted = false, children }: { label: string; summary: string; muted?: boolean; children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {label} <span className="text-zinc-600">{summary}</span>
      </button>
      {open && <p className={`mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6 ${muted ? "italic text-zinc-400" : "text-zinc-300"}`}>
          <Capped text={children} />
        </p>}
    </div>
  );
}

/** Renders the first PANEL_MAX chars and a button to reveal the rest. */
function Capped({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  if (all || text.length <= PANEL_MAX) return <>{text}</>;
  return (
    <>
      {text.slice(0, PANEL_MAX)}
      {"\n"}
      <button type="button" onClick={() => setAll(true)} className="mt-2 text-zinc-500 not-italic hover:text-zinc-300">
        Show all ({formatTokens(text.length)} chars)
      </button>
    </>
  );
}

function LongText({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_TEXT;
  const shown = long && !open ? text.slice(0, LONG_TEXT) + "..." : text;
  return (
    <div>
      <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6 ${className}`}>{shown}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
