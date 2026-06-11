// Pure number/percentage formatters used across the dashboard.

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

/** "12345" → "12,345"; "1300" → "1.3K" when compact. */
export function fmtCompact(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export function fmtPct(n: number, digits = 1): string {
  return n.toFixed(digits) + '%';
}

export function fmtSignedPct(n: number, digits = 1): string {
  const s = n >= 0 ? '+' : '';
  return s + n.toFixed(digits) + '%';
}
