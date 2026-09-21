import { describe, expect, it } from "vitest";
import { ID_LENGTH, isValidId, makeId } from "./id";

describe("makeId", () => {
  it("makes url safe ids of the fixed length", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toHaveLength(ID_LENGTH);
      expect(id).toMatch(/^[0-9A-Za-z]+$/);
    }
  });
  it("validates ids", () => {
    expect(isValidId(makeId())).toBe(true);
    expect(isValidId("short")).toBe(false);
    expect(isValidId("../../etc/passwd")).toBe(false);
    expect(isValidId("a".repeat(ID_LENGTH))).toBe(true);
  });
});
