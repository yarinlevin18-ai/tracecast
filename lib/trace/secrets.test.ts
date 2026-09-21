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

  it("masks quoted env values", () => {
    expect(redactText('DB_PASSWORD="my secret pass" done')).toBe("DB_PASSWORD=REDACTED done");
  });

  it("masks connection strings", () => {
    expect(redactText("postgres://user:pass@localhost:5432/db")).toBe("postgres://user:REDACTED@localhost:5432/db");
    expect(redactText("mongodb+srv://admin:P@ssw0rd!@cluster0.mongodb.net/db")).toBe(
      "mongodb+srv://admin:REDACTED@cluster0.mongodb.net/db",
    );
  });

  it("masks whole env-style lines and still masks known env assignments", () => {
    expect(redactText("DATABASE_URL=postgres://host/db\nnext line")).toBe("REDACTED_ENV_LINE\nnext line");
    expect(redactText("OPENAI_API_KEY=abc123 DB_PASSWORD=hunter2")).toBe("OPENAI_API_KEY=REDACTED DB_PASSWORD=REDACTED");
  });

  it("masks a google api key", () => {
    expect(redactText("k " + "AIza" + "x".repeat(35))).toBe("k AIza-REDACTED");
  });

  it("masks a telegram bot token", () => {
    expect(redactText("t 123456789:" + "A".repeat(35))).toBe("t TELEGRAM-REDACTED");
  });

  it("masks a bearer token", () => {
    expect(redactText("Authorization: Bearer " + "a".repeat(30))).toBe("Authorization: Bearer REDACTED");
  });

  it("masks secret fields in json", () => {
    expect(redactText('{"password": "hunter2", "apiKey": "abc"}')).toBe('{"password":"REDACTED", "apiKey":"REDACTED"}');
  });

  it("masks windows home paths", () => {
    expect(redactText("D:\\Yarin\\Projects")).toBe("D:\\Users\\dev\\Projects");
    expect(redactText("C:\\Users\\Yarin\\x")).toBe("C:\\Users\\dev\\x");
  });

  it("masks a slack app token", () => {
    expect(redactText("xapp-1-A123-456-abcdef")).toBe("xapp-REDACTED");
  });
});
