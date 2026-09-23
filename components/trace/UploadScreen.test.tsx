// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadScreen } from "./UploadScreen";

describe("UploadScreen", () => {
  it("shows the drop zone, the privacy note and a way back to the demo", () => {
    render(<UploadScreen onFiles={() => {}} error={null} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/replay/i);
    expect(screen.getByTestId("dropzone")).toBeTruthy();
    expect(screen.getAllByText(/nothing leaves your browser/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /demo/i }).getAttribute("href")).toBe("/demo");
  });
});
