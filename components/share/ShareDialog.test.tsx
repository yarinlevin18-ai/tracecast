// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedSnippet, ShareDialog } from "./ShareDialog";
import type { Step, Trace } from "@/lib/trace/types";

const T = "2026-09-21T10:00:00.000Z";
const step = (p: Partial<Step> & Pick<Step, "id" | "kind">): Step => ({ index: 0, at: T, agent: "main", ...p });
const trace: Trace = {
  id: "t",
  source: "claude-code",
  title: "Demo",
  startedAt: T,
  endedAt: T,
  totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 },
  steps: [
    step({ id: "u", kind: "user", text: "token sk-abcdefghijklmnopqrstuvwxyz here" }),
    step({ id: "a", kind: "assistant", text: "clean" }),
  ].map((s, index) => ({ ...s, index })),
};

afterEach(() => vi.unstubAllGlobals());

describe("ShareDialog", () => {
  it("lists flagged steps with redacted previews and lets you remove one", () => {
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    expect(screen.getByText(/1 step/)).toBeTruthy();
    expect(screen.getByText(/sk-REDACTED/)).toBeTruthy();
    expect(screen.queryByText(/sk-abcdef/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /remove step/i }));
    expect(screen.getByText(/removed/i)).toBeTruthy();
  });

  it("posts the redacted trace and shows the link", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "AbCdEfGhIjKl", url: "http://x/r/AbCdEfGhIjKl", expiresAt: null }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByDisplayValue("http://x/r/AbCdEfGhIjKl")).toBeTruthy());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.trace.steps[0].text).toBe("token sk-REDACTED here");
    expect(body.expiresInDays).toBe(30);
  });

  it("shows the server error when sharing is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sharing is not configured" }), { status: 503 })));
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByText(/not configured/i)).toBeTruthy());
  });

  it("flags a redacted title even when the steps are clean", () => {
    const titledTrace: Trace = {
      ...trace,
      title: "/Users/alice/proj",
      steps: [step({ id: "ok", kind: "assistant", text: "clean" })],
    };
    render(<ShareDialog trace={titledTrace} onClose={() => {}} />);
    expect(screen.getByText(/title contained/i)).toBeTruthy();
  });

  it("offers an iframe snippet next to the link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "AbCdEfGhIjKl", url: "http://x/r/AbCdEfGhIjKl", expiresAt: null }), { status: 201 })));
    render(<ShareDialog trace={trace} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByLabelText("Embed on your site")).toBeTruthy());
    const snippet = (screen.getByLabelText("Embed on your site") as HTMLTextAreaElement).value;
    expect(snippet).toContain('src="http://x/embed/AbCdEfGhIjKl"');
    expect(snippet).toContain("<iframe");
  });
});

describe("embedSnippet", () => {
  it("maps the share url to the embed url", () => {
    expect(embedSnippet("https://tracecast.app/r/AbCdEfGhIjKl")).toContain('src="https://tracecast.app/embed/AbCdEfGhIjKl"');
  });
});
