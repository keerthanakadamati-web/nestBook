export type ReviewPayment = { id: string; flat_id: string; amount: number; method: string; status: string; paid_on: string; month_covered: string; reference: string | null; receipt_no: string };
/** Candidates only. Never subtract or remove these rows from accounting totals. */
export function suspectedPaymentGroups<T extends ReviewPayment>(payments: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const p of payments) {
    if (p.status === "rejected") continue;
    const reference = p.reference?.trim().toLowerCase();
    const key = p.method === "upi" && reference ? `upi:${reference}` : JSON.stringify([p.flat_id, p.method, Number(p.amount), p.paid_on, p.month_covered.trim().toLowerCase()]);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
}