// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("shows the pitch, the drop zone and the live demo", () => {
    render(<Landing onFiles={() => {}} error={null} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/replay/i);
    expect(screen.getByTestId("dropzone")).toBeTruthy();
    const frame = screen.getByTitle("Tracecast demo replay") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/demo?autoplay=1");
    expect(screen.getAllByText(/nothing leaves your browser/i).length).toBeGreaterThan(0);
  });
});
