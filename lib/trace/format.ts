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
  if (ms < 10000) {
    const s = ms / 1000;
    return `${s.toFixed(1).replace(/\.0$/, "")}s`;
  }
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const s = total % 60;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m}m ${s}s`;
  const mm = m % 60;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${mm}m`;
  const hh = h % 24;
  const d = Math.floor(h / 24);
  return `${d}d ${hh}h`;
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
