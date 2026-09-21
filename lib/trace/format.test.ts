import { describe, expect, it } from "vitest";
import { formatDuration, formatOffset, formatTokens } from "./format";

describe("formatTokens", () => {
  it("keeps small numbers, abbreviates thousands and millions", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatTokens(15000)).toBe("15k");
    expect(formatTokens(279185)).toBe("279k");
    expect(formatTokens(50902560)).toBe("50.9M");
  });
});

describe("formatDuration", () => {
  it("picks the two most significant units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(900)).toBe("0.9s");
    expect(formatDuration(3400)).toBe("3.4s");
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(3720000)).toBe("1h 2m");
    expect(formatDuration(162780981)).toBe("1d 21h");
  });

  it("rolls seconds over into the next unit instead of showing 60", () => {
    expect(formatDuration(119600)).toBe("2m 0s");
    expect(formatDuration(59500)).toBe("1m 0s");
    expect(formatDuration(3599600)).toBe("1h 0m");
  });
});

describe("formatOffset", () => {
  it("formats a millisecond offset as +m:ss or +h:mm:ss", () => {
    expect(formatOffset(0)).toBe("+0:00");
    expect(formatOffset(65000)).toBe("+1:05");
    expect(formatOffset(3725000)).toBe("+1:02:05");
  });
});
