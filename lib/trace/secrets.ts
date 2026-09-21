export type SecretPattern = { name: string; pattern: RegExp; replacement: string };

/**
 * Order matters: private keys, JWTs, and connection strings go first so the
 * generic patterns below them never see their inner text. env-assignment
 * runs before env-line so env-line's lookahead can skip lines env-assignment
 * already redacted.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[PRIVATE KEY REDACTED]",
  },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: "JWT-REDACTED" },
  {
    name: "conn-string",
    pattern: /(\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s\/:@]+):((?:[^\s\/@]+@)*[^\s\/@]+)@/g,
    replacement: "$1$2:REDACTED@",
  },
  { name: "bearer", pattern: /\bBearer\s+[A-Za-z0-9\-_.]{20,}/g, replacement: "Bearer REDACTED" },
  { name: "anthropic/openai", pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: "sk-REDACTED" },
  { name: "google", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: "AIza-REDACTED" },
  { name: "telegram", pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g, replacement: "TELEGRAM-REDACTED" },
  { name: "aws", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "AKIA-REDACTED" },
  { name: "github", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replacement: "gh_REDACTED" },
  { name: "slack", pattern: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g, replacement: "xox-REDACTED" },
  { name: "slack-app", pattern: /\bxapp-[A-Za-z0-9-]{10,}/g, replacement: "xapp-REDACTED" },
  {
    name: "json-secret-field",
    pattern: /"(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)"\s*:\s*"[^"]*"/gi,
    replacement: '"$1":"REDACTED"',
  },
  {
    name: "env-assignment",
    pattern: /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS))=("[^"]*"|'[^']*'|\S+)/g,
    replacement: "$1=REDACTED",
  },
  { name: "env-line", pattern: /^[A-Z][A-Z0-9_]{2,}=(?!REDACTED\b)\S.*$/gm, replacement: "REDACTED_ENV_LINE" },
  {
    name: "email",
    // The negative lookahead stops this from re-matching the "REDACTED@host"
    // text that conn-string just produced (\b keeps it from retrying mid-word).
    pattern: /\b(?!REDACTED@)[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    replacement: "user@example.com",
  },
  { name: "home-dir", pattern: /\/Users\/yarin\b/g, replacement: "/Users/dev" },
  { name: "windows-home", pattern: /([A-Za-z]):\\(?:Users\\)?Yarin\b/gi, replacement: "$1:\\Users\\dev" },
];

export function redactText(text: string): string {
  return SECRET_PATTERNS.reduce((acc, p) => acc.replace(p.pattern, p.replacement), text);
}
