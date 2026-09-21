"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { editStepText, removeSteps, type EditableField } from "@/lib/share/edit";
import { redactTrace, type RedactionHit } from "@/lib/share/redact";
import { toolSummary } from "@/lib/trace/summary";
import type { Step, Trace } from "@/lib/trace/types";
import { StepIcon } from "@/components/trace/StepIcon";

type Props = { trace: Trace; onClose: () => void };
type Expiry = 7 | 30 | null;
type Phase = { kind: "review" } | { kind: "busy" } | { kind: "done"; url: string; expiresAt: string | null } | { kind: "error"; message: string };

const PREVIEW = 220;

function preview(step: Step): string {
  const raw = step.text ?? step.result?.output ?? (step.tool ? `${step.tool.name} ${toolSummary(step.tool)}` : "");
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW ? flat.slice(0, PREVIEW) + "..." : flat;
}

export function ShareDialog({ trace, onClose }: Props) {
  const redacted = useMemo(() => redactTrace(trace), [trace]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { field: EditableField; value: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<Expiry>(30);
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const stepById = useMemo(() => new Map(redacted.trace.steps.map((s) => [s.id, s])), [redacted]);

  function finalTrace(): Trace {
    let t = redacted.trace;
    for (const [id, e] of Object.entries(edits)) t = editStepText(t, id, e.field, e.value);
    return removeSteps(t, removed);
  }

  async function create() {
    setPhase({ kind: "busy" });
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trace: finalTrace(), expiresInDays: expiry }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string | null; error?: string };
      if (!res.ok || !data.url) {
        setPhase({ kind: "error", message: data.error ?? `Upload failed (${res.status})` });
        return;
      }
      setPhase({ kind: "done", url: data.url, expiresAt: data.expiresAt ?? null });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  const hits = redacted.hits;
  const remaining = redacted.trace.steps.length - removed.size;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 id="share-title" className="text-base font-semibold text-zinc-50">Share this replay</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {phase.kind === "done" ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-zinc-300">Your replay is live. Anyone with the link can watch it{phase.expiresAt ? ` until ${new Date(phase.expiresAt).toLocaleDateString()}` : ""}.</p>
            <div className="flex gap-2">
              <input readOnly value={phase.url} aria-label="Share link" className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200" />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(phase.url);
                  setCopied(true);
                }}
                className="flex items-center gap-1 rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-900"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-zinc-300">
                {hits.length === 0
                  ? "No secrets or personal paths found. Review is optional."
                  : `${hits.length} step${hits.length === 1 ? "" : "s"} had secrets or personal paths. They are redacted below; edit or remove anything else you would rather not publish.`}
              </p>
              <ul className="mt-4 space-y-3">
                {hits.map((h) => {
                  const step = stepById.get(h.stepId);
                  if (!step) return null;
                  return (
                    <HitRow
                      key={h.stepId}
                      hit={h}
                      step={step}
                      removed={removed.has(h.stepId)}
                      edit={edits[h.stepId]}
                      editing={editing === h.stepId}
                      onRemove={() => setRemoved((s) => new Set(s).add(h.stepId))}
                      onRestore={() =>
                        setRemoved((s) => {
                          const n = new Set(s);
                          n.delete(h.stepId);
                          return n;
                        })
                      }
                      onEdit={() => setEditing(editing === h.stepId ? null : h.stepId)}
                      onChange={(field, value) => setEdits((e) => ({ ...e, [h.stepId]: { field, value } }))}
                    />
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-5 py-4">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Expires
                <select
                  value={expiry === null ? "never" : String(expiry)}
                  onChange={(e) => setExpiry(e.target.value === "never" ? null : (Number(e.target.value) as Expiry))}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200"
                >
                  <option value="7">in 7 days</option>
                  <option value="30">in 30 days</option>
                  <option value="never">never</option>
                </select>
              </label>
              <span className="text-xs text-zinc-500">{remaining} steps will be published</span>
              {phase.kind === "error" && <span className="w-full text-xs text-red-300">{phase.message}</span>}
              <button
                type="button"
                disabled={phase.kind === "busy" || remaining === 0}
                onClick={create}
                className="ml-auto rounded-full bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              >
                {phase.kind === "busy" ? "Uploading..." : "Create link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HitRow(props: {
  hit: RedactionHit;
  step: Step;
  removed: boolean;
  edit?: { field: EditableField; value: string };
  editing: boolean;
  onRemove: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onChange: (field: EditableField, value: string) => void;
}) {
  const { hit, step, removed, edit, editing } = props;
  const field: EditableField = step.text !== undefined ? "text" : "result.output";
  const editable = step.text !== undefined || step.result !== undefined;
  const current = edit?.value ?? (field === "text" ? step.text ?? "" : step.result?.output ?? "");
  return (
    <li className={`rounded-lg border px-3 py-2 ${removed ? "border-zinc-800 opacity-60" : "border-amber-900/50 bg-amber-400/5"}`}>
      <div className="flex items-center gap-2 text-xs">
        <StepIcon kind={step.kind} className="h-3.5 w-3.5" />
        <span className="text-zinc-400">#{hit.index + 1}</span>
        <span className="truncate text-zinc-500">{hit.patterns.join(", ")}</span>
        <span className="ml-auto flex gap-2">
          {removed ? (
            <button type="button" onClick={props.onRestore} className="text-zinc-400 hover:text-zinc-200">Restore</button>
          ) : (
            <>
              {editable && (
                <button type="button" onClick={props.onEdit} className="text-zinc-400 hover:text-zinc-200">{editing ? "Done" : "Edit"}</button>
              )}
              <button type="button" aria-label="Remove step" onClick={props.onRemove} className="text-red-300 hover:text-red-200">Remove</button>
            </>
          )}
        </span>
      </div>
      {removed ? (
        <p className="mt-1 text-xs text-zinc-500">Removed from the shared replay.</p>
      ) : editing ? (
        <textarea
          value={current}
          onChange={(e) => props.onChange(field, e.target.value)}
          rows={5}
          className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-200"
        />
      ) : (
        <p className="mt-1 font-mono text-xs text-zinc-300 [overflow-wrap:anywhere]">{edit ? preview({ ...step, text: edit.value }) : preview(step)}</p>
      )}
    </li>
  );
}
