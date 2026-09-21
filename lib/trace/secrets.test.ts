import { describe, expect, it } from "vitest";
import { matchedPatterns, redactText } from "./secrets";

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
    expect(redactText("/tmp/claude-501/-Users-yarin-Projects-x/1")).toBe("/tmp/claude-501/-Users-dev-Projects-x/1");
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

  it("masks lowercase env assignments", () => {
    expect(redactText("database_password=hunter2 ok")).toBe("database_password=REDACTED ok");
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

  it("leaves asset filenames and git remotes alone", () => {
    const text = "logo@2x.png and git@github.com:me/repo.git";
    expect(redactText(text)).toBe(text);
  });

  it("masks Stripe and npm tokens", () => {
    expect(redactText("sk_live_abcdefghijklmnop1234 rk_test_abcdefghijklmnop1234 npm_abcdefghijklmnopqrstuvwxyz")).toBe(
      "STRIPE-REDACTED STRIPE-REDACTED npm_REDACTED",
    );
  });

  it("rewrites any home directory, not only the fixture owner's", () => {
    expect(redactText("/Users/alice/Projects/x and /home/bob/y and C:\\Users\\Carol\\z")).toBe(
      "/Users/dev/Projects/x and /home/dev/y and C:\\Users\\dev\\z"
    );
    expect(redactText("/Users/dev/already")).toBe("/Users/dev/already");
  });
});

describe("matchedPatterns", () => {
  it("names the patterns that would change the text", () => {
    expect(matchedPatterns("sk-abcdefghijklmnopqrstuvwxyz and /Users/x/y")).toEqual(
      expect.arrayContaining(["anthropic/openai", "home-dir-any"])
    );
    expect(matchedPatterns("plain")).toEqual([]);
  });
});
