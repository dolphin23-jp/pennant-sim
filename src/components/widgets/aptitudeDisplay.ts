export function aptitudeToneColor(value: number | null): string | null {
  if (value === null) return null;
  if (value >= 85) return 'var(--color-success)';
  if (value >= 60) return 'var(--color-accent)';
  if (value >= 40) return 'var(--color-warning)';
  return 'var(--color-danger)';
}
