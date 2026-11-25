/** Society calendar date, independent of the browser/server's local timezone. */
export function societyDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function periodCutoff(month: string, today = societyDate()) {
  const [year = 2026, m = 1] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  return end < today ? end : today;
}
export function expenseAccountingMonth(expense: { expense_month?: string | null; expense_date: string }) {
  return expense.expense_month || expense.expense_date.slice(0, 7);
}