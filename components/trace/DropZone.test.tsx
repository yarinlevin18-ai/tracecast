// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

describe("DropZone", () => {
  it("reads picked files and reports name and text", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    const file = new File(['{"type":"user"}\n'], "main.jsonl", { type: "application/x-ndjson" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toEqual([{ name: "main.jsonl", text: '{"type":"user"}\n' }]);
  });

  it("accepts dropped files", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);
    const zone = screen.getByTestId("dropzone");
    const file = new File(["x"], "agent-1.jsonl");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0][0].name).toBe("agent-1.jsonl");
  });
});
