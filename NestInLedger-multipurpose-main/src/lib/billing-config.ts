import type { Database } from "@/integrations/supabase/types";
export type MaintenanceRate = Pick<Database["public"]["Tables"]["maintenance_rates"]["Row"], "effective_month" | "monthly_amount" | "due_day" | "fy_start_month">;
export type MaintenanceBill = Pick<Database["public"]["Tables"]["maintenance_bills"]["Row"], "flat_id" | "bill_month" | "amount" | "due_date">;
export const baselineRate: MaintenanceRate = { effective_month: "1900-01-01", monthly_amount: 1500, due_day: 1, fy_start_month: 4 };
export function rateForMonth(rates: MaintenanceRate[], month: string) {
  return rates.filter((r) => r.effective_month.slice(0, 7) <= month.slice(0, 7)).sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0] ?? baselineRate;
}
export function dueDateForMonth(month: string, day: number) {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  return `${month.slice(0, 7)}-${String(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
}