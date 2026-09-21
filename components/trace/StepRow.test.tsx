// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepRow } from "./StepRow";
import type { TimelineRow } from "@/lib/trace/timeline";
import type { Step } from "@/lib/trace/types";

const T0 = "2026-09-21T10:00:00.000Z";

function row(step: Partial<Step> & Pick<Step, "id" | "kind">, extra: Partial<TimelineRow> = {}): TimelineRow {
  const s: Step = { index: 0, at: "2026-09-21T10:01:05.000Z", agent: "main", durationMs: 0, ...step };
  return { key: s.id, step: s, depth: 0, ...extra };
}

describe("StepRow", () => {
  it("renders user text with an offset from session start", () => {
    render(<StepRow row={row({ id: "u", kind: "user", text: "Fix it" })} startedAt={T0} />);
    expect(screen.getByText("Fix it")).toBeTruthy();
    expect(screen.getByText("+1:05")).toBeTruthy();
  });

  it("shows an empty object for a tool call without input", () => {
    const r = row({ id: "c", kind: "tool_call", tool: { name: "Ping", input: undefined, callId: "x" } });
    render(<StepRow row={r} startedAt={T0} />);
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("{}")).toBeTruthy();
  });

  it("renders a tool call with its summary and toggles input and output", () => {
    const r = row(
      { id: "c", kind: "tool_call", tool: { name: "Read", input: { file_path: "a.ts" }, callId: "x" } },
      { result: { callId: "x", output: "const a = 1;", isError: false } }
    );
    render(<StepRow row={r} startedAt={T0} />);
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.queryByText("const a = 1;")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("const a = 1;")).toBeTruthy();
    expect(screen.getByText(/"file_path": "a.ts"/)).toBeTruthy();
  });

  it("collapses thinking by default and shows the agent badge for subagent steps", () => {
    render(
      <StepRow
        row={row({ id: "t", kind: "thinking", text: "deep thoughts", agent: "Reviewer", parentId: "p" }, { depth: 1 })}
        startedAt={T0}
      />
    );
    expect(screen.queryByText("deep thoughts")).toBeNull();
    expect(screen.getByText("Reviewer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /thinking/i }));
    expect(screen.getByText("deep thoughts")).toBeTruthy();
  });

  it("marks failed tool results", () => {
    const r = row(
      { id: "c", kind: "tool_call", tool: { name: "Bash", input: { command: "false" }, callId: "x" } },
      { result: { callId: "x", output: "exit 1", isError: true } }
    );
    render(<StepRow row={r} startedAt={T0} />);
    expect(screen.getByText("failed")).toBeTruthy();
  });
});
