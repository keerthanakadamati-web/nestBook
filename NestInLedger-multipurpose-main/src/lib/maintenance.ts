import { dueDateForMonth, rateForMonth, type MaintenanceRate, type MaintenanceBill } from "./billing-config";
import { periodCutoff } from "./accounting-date";
export type BillingFlat = { id: string; billing_start: string };
export type BillingPayment = { flat_id: string; amount: number; paid_on: string; status: string };

export function monthBounds(month: string) {
  const [year = 2026, m = 1] = month.split("-").map(Number);
  return { start: `${month}-01`, next: m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01` };
}

/** Frozen bills take precedence; projections use approved rates and oldest-dues-first payments. */
export function maintenanceStatement(flat: BillingFlat, payments: BillingPayment[], month: string, rates: MaintenanceRate[] = [], bills: MaintenanceBill[] = [], asOf = periodCutoff(month)) {
  const { start, next } = monthBounds(month);
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const [by = 2026, bm = 1] = flat.billing_start.split("-").map(Number);
  const months = Math.max((y - by) * 12 + m - bm + 1, 0);
  const paid = payments.filter((p) => p.flat_id === flat.id && p.status === "confirmed" && p.paid_on < next && p.paid_on <= asOf).reduce((sum, p) => sum + Number(p.amount), 0);
  const applicable = rateForMonth(rates, month);
  let total = 0;
  for (let i = 0; i < months; i++) {
    const date = new Date(Date.UTC(by, bm - 1 + i, 1));
    const ym = date.toISOString().slice(0, 7);
    const issued = bills.find((b) => b.flat_id === flat.id && b.bill_month.slice(0, 7) === ym);
    total += Number(issued?.amount ?? rateForMonth(rates, ym).monthly_amount);
  }
  const issued = bills.find((b) => b.flat_id === flat.id && b.bill_month === start);
  const billed = months > 0 ? Number(issued?.amount ?? applicable.monthly_amount) : 0;
  const previous = Math.max(total - billed - paid, 0);
  const outstanding = Math.max(total - paid, 0);
  const currentPaid = Math.min(billed, Math.max(paid - (total - billed), 0));
  const currentOutstanding = billed - currentPaid;
  // Whole-account status: partial means an actual partially settled oldest unpaid bill.
  let remainingPayment = paid;
  let partialBill = false;
  for (let i = 0; i < months; i++) {
    const ym = new Date(Date.UTC(by, bm - 1 + i, 1)).toISOString().slice(0, 7);
    const charge = Number(bills.find((b) => b.flat_id === flat.id && b.bill_month.slice(0, 7) === ym)?.amount ?? rateForMonth(rates, ym).monthly_amount);
    if (remainingPayment > 0 && remainingPayment < charge) partialBill = true;
    remainingPayment = Math.max(remainingPayment - charge, 0);
  }
  const status = outstanding === 0 ? "paid" : partialBill ? "partial" : "outstanding";
  return { billed, previous, outstanding, paid, status, currentPaid, currentOutstanding, credit: Math.max(paid - total, 0), dueDate: issued?.due_date ?? dueDateForMonth(month, applicable.due_day) };
}