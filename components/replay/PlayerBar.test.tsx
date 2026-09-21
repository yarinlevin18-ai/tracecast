// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { motionValue } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBar } from "./PlayerBar";
import type { Player } from "./usePlayer";

function player(over: Partial<Player> = {}): Player {
  return {
    time: motionValue(0),
    index: 3,
    playing: false,
    ended: false,
    speed: 1,
    totalMs: 60_000,
    count: 10,
    toggle: vi.fn(),
    seek: vi.fn(),
    seekStep: vi.fn(),
    stepBy: vi.fn(),
    setSpeed: vi.fn(),
    ...over,
  };
}

describe("PlayerBar", () => {
  it("shows play when paused, pause when playing, replay when ended", () => {
    const { rerender } = render(<PlayerBar player={player()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    rerender(<PlayerBar player={player({ playing: true })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    rerender(<PlayerBar player={player({ ended: true })} />);
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("wires toggle, step buttons, speed and the scrub bar", () => {
    const p = player();
    render(<PlayerBar player={p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(p.toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(p.stepBy).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(p.stepBy).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    expect(p.setSpeed).toHaveBeenCalledWith(2);
    const scrub = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
    expect(scrub.max).toBe("60000");
    fireEvent.change(scrub, { target: { value: "12000" } });
    expect(p.seek).toHaveBeenCalledWith(12000);
  });

  it("shows the step counter and total time", () => {
    render(<PlayerBar player={player()} />);
    expect(screen.getByText("4 / 10")).toBeTruthy();
    expect(screen.getByText("1:00")).toBeTruthy();
  });
});
