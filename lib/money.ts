export function formatVnd(amount: number): string {
  const n = Math.round(Math.abs(amount));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const COMPACT_UNITS = [
  { value: 1_000_000_000, suffix: 'B' },
  { value: 1_000_000, suffix: 'M' },
  { value: 1_000, suffix: 'K' },
] as const;

export function formatVndCompact(amount: number): string {
  const n = Math.round(Math.abs(amount));
  for (const unit of COMPACT_UNITS) {
    if (n < unit.value) continue;
    let scaled = Math.round((n / unit.value) * 10) / 10;
    if (scaled >= 1000) {
      const next = COMPACT_UNITS.find((item) => item.value === unit.value * 1000);
      if (next) {
        scaled = Math.round((n / next.value) * 10) / 10;
        return compactLabel(scaled, next.suffix);
      }
    }
    return compactLabel(scaled, unit.suffix);
  }
  return formatVnd(n);
}

function compactLabel(scaled: number, suffix: string) {
  const text = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace('.', ',');
  return `${text}${suffix}`;
}

export function parseVndInput(input: string): number {
  const digits = input.replace(/\D/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
