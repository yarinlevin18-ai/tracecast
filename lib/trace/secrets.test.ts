import { describe, expect, it } from "vitest";
import { redactText } from "./secrets";

describe("redactText", () => {
  it("masks common credential shapes", () => {
    expect(redactText("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123")).toBe("key sk-REDACTED");
    expect(redactText("aws AKIAIOSFODNN7EXAMPLE")).toBe("aws AKIA-REDACTED");
    expect(redactText("gh ghp_abcdefghijklmnopqrstuvwxyz1234")).toBe("gh gh_REDACTED");
    expect(redactText("slack xoxb-1234567890-abcdef")).toBe("slack xox-REDACTED");
    expect(redactText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop")).toBe("jwt JWT-REDACTED");
  });

  it("masks env assignments, emails and the home dir", () => {
    expect(redactText("OPENAI_API_KEY=abc123 DB_PASSWORD=hunter2")).toBe("OPENAI_API_KEY=REDACTED DB_PASSWORD=REDACTED");
    expect(redactText("mail yarinlevin18@gmail.com now")).toBe("mail user@example.com now");
    expect(redactText("/Users/yarin/Projects/x")).toBe("/Users/dev/Projects/x");
  });

  it("masks private key blocks", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nabc\ndef\n-----END RSA PRIVATE KEY-----";
    expect(redactText(`x ${key} y`)).toBe("x [PRIVATE KEY REDACTED] y");
  });

  it("leaves ordinary text alone", () => {
    expect(redactText("const x = 1; // nothing here")).toBe("const x = 1; // nothing here");
  });
});
