/** Whole days from today until the expiry date (negative once expired). */
export function daysLeft(expiresOn: string, today: Date = new Date()): number {
  const end = new Date(`${expiresOn}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Extends from the current expiry (or today if already expired) by the given months. */
export function extendBy(expiresOn: string, months: number, today: Date = new Date()): string {
  const base = new Date(`${expiresOn}T00:00:00`);
  const from = base < today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : base;
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
