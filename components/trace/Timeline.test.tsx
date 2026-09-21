// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import type { TimelineRow } from "@/lib/trace/timeline";

const T = "2026-09-21T10:00:00.000Z";

function rows(n: number): TimelineRow[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `s${i}`,
    depth: 0,
    step: { id: `s${i}`, index: i, at: T, agent: "main", kind: "user", text: `msg ${i}`, durationMs: 0 },
  }));
}

describe("Timeline", () => {
  it("renders every row when the list is short", () => {
    const { container } = render(<Timeline rows={rows(5)} startedAt={T} />);
    expect(container.querySelectorAll("article").length).toBe(5);
  });

  it("switches to the virtualized list above the threshold", () => {
    const { container } = render(<Timeline rows={rows(301)} startedAt={T} />);
    expect(container.querySelector("[data-virtualized]")).toBeTruthy();
  });

  it("passes replay state to rows", () => {
    const list = rows(3);
    list[1] = {
      ...list[1],
      step: { ...list[1].step, kind: "tool_call", tool: { name: "Read", input: {}, callId: "c" } },
      result: { callId: "c", output: "", isError: false },
      resultIndex: 2,
    };
    const { container } = render(<Timeline rows={list} startedAt={T} current={1} />);
    const articles = container.querySelectorAll("article");
    expect(articles[1].getAttribute("data-active")).toBe("true");
    expect(articles[0].getAttribute("data-active")).toBeNull();
    expect(container.textContent).toContain("running");
  });
});
