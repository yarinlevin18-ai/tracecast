export type SecretPattern = { name: string; pattern: RegExp; replacement: string };

/** Order matters: private keys and JWTs first so their inner text is not partially matched later. */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[PRIVATE KEY REDACTED]",
  },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: "JWT-REDACTED" },
  { name: "anthropic/openai", pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: "sk-REDACTED" },
  { name: "aws", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "AKIA-REDACTED" },
  { name: "github", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replacement: "gh_REDACTED" },
  { name: "slack", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replacement: "xox-REDACTED" },
  { name: "env-assignment", pattern: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS))=\S+/g, replacement: "$1=REDACTED" },
  { name: "email", pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, replacement: "user@example.com" },
  { name: "home-dir", pattern: /\/Users\/yarin\b/g, replacement: "/Users/dev" },
];

export function redactText(text: string): string {
  return SECRET_PATTERNS.reduce((acc, p) => acc.replace(p.pattern, p.replacement), text);
}
