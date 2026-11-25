import { expect, test } from "bun:test";
import { maintenanceStatement } from "../src/lib/maintenance";
import { dueDateForMonth, baselineRate } from "../src/lib/billing-config";
const flat = { id: "test", billing_start: "2026-01-01" };
const rates = [baselineRate, { effective_month: "2026-03-01", monthly_amount: 2000, due_day: 31, fy_start_month: 4 }];
test("approved rate changes apply only from their effective month", () => {
  expect(maintenanceStatement(flat, [], "2026-02", rates).outstanding).toBe(3000);
  expect(maintenanceStatement(flat, [], "2026-03", rates).outstanding).toBe(5000);
  expect(maintenanceStatement(flat, [], "2026-03", rates).billed).toBe(2000);
});
test("issued bills are preserved even if a projection rate differs", () => {
  const bills = [{ flat_id: "test", bill_month: "2026-03-01", amount: 1500, due_date: "2026-03-01" }];
  expect(maintenanceStatement(flat, [], "2026-03", rates, bills).outstanding).toBe(4500);
  expect(maintenanceStatement(flat, [], "2026-03", rates, bills).dueDate).toBe("2026-03-01");
});
test("due days cap at the last day in short months", () => {
  expect(dueDateForMonth("2026-02", 31)).toBe("2026-02-28");
  expect(dueDateForMonth("2028-02", 31)).toBe("2028-02-29");
});
test("only confirmed payments stop reminders by clearing the balance", () => {
  const payment = { flat_id: "test", amount: 5000, paid_on: "2026-03-04", status: "pending" };
  expect(maintenanceStatement(flat, [payment], "2026-03", rates).outstanding).toBe(5000);
  expect(maintenanceStatement(flat, [{ ...payment, status: "confirmed" }], "2026-03", rates).outstanding).toBe(0);
});