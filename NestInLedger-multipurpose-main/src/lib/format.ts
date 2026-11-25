export function rupees(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  outstanding: "Outstanding",
};

/** Indian financial year: April 1 – March 31. Returns the starting year. */
export function fyStartOf(date: Date = new Date(), startMonth = 4): number {
  return date.getMonth() >= startMonth - 1 ? date.getFullYear() : date.getFullYear() - 1;
}

export function fyLabel(start: number): string {
  return `FY ${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The 12 months of a financial year as "YYYY-MM", April first. */
export function fyMonths(start: number, startMonth = 4): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = startMonth - 1 + i < 12 ? start : start + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

export function fyRange(start: number, startMonth = 4) {
  const month = String(startMonth).padStart(2, "0");
  return { from: `${start}-${month}-01`, to: `${start + 1}-${month}-01` };
}

export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
