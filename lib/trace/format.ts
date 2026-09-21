/** 1234 -> "1.2k", 50902560 -> "50.9M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return trim(n / 1000) + "k";
  return trim(n / 1_000_000) + "M";
}

/** One decimal below 100, none above: 1.2, 15, 50.9, 279. */
function trim(x: number): string {
  return x < 100 ? x.toFixed(1).replace(/\.0$/, "") : String(Math.round(x));
}

/** Two most significant units: "3.4s", "1m 5s", "1h 2m", "1d 21h". */
export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace(/\.0$/, "") : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Offset from session start: "+1:05" or "+1:02:05". */
export function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mmss = h > 0 ? `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `+${h}:${mmss}` : `+${mmss}`;
}
