import { expect, test } from "bun:test";
import { maintenanceStatement } from "../src/lib/maintenance";
import { societyDate, periodCutoff, expenseAccountingMonth } from "../src/lib/accounting-date";
import { suspectedPaymentGroups } from "../src/lib/payment-review";

const flat = { id: "f", billing_start: "2026-09-01" };
const payment = (amount, paid_on, status = "confirmed", flat_id = "f") => ({ flat_id, amount, paid_on, status });
test("15 authorized flats at 1500 bill exactly 22500 for one month", () => {
  expect(Array.from({ length: 15 }, (_, i) => maintenanceStatement({ ...flat, id: String(i) }, [], "2026-09").billed).reduce((a,b) => a+b,0)).toBe(22500);
});
test("arrears carry forward once and components reconcile after partial current payment", () => {
  const s = maintenanceStatement(flat, [payment(2000, "2026-10-09")], "2026-10");
  expect(s.previous).toBe(0); expect(s.currentOutstanding).toBe(1000); expect(s.outstanding).toBe(1000);
  expect(s.previous+s.currentOutstanding).toBe(s.outstanding); expect(s.status).toBe("partial");
});
test("no payment at changed rates never implies partial settlement", () => {
  const s = maintenanceStatement(flat, [], "2026-10", [{ effective_month: "2026-10-01", monthly_amount: 2000, due_day: 1, fy_start_month: 4 }]);
  expect(s.outstanding).toBe(3500); expect(s.status).toBe("outstanding");
});
test("confirmed payments clear oldest bills before current month", () => {
  const s = maintenanceStatement(flat, [payment(500,"2026-10-09")],"2026-10");
  expect(s.previous).toBe(1000); expect(s.currentPaid).toBe(0); expect(s.currentOutstanding).toBe(1500);
});
test("advance credit stays with its own flat and is separate from other dues", () => {
  const payments=[payment(4500,"2026-10-09")];
  expect(maintenanceStatement(flat,payments,"2026-10").credit).toBe(1500);
  expect(maintenanceStatement({...flat,id:"other"},payments,"2026-10").outstanding).toBe(3000);
});
test("pending and future receipts never reduce recognized dues", () => {
  expect(maintenanceStatement(flat,[payment(1500,"2026-10-02","pending"),payment(1500,"2026-10-20")],"2026-10",[],[],"2026-10-09").paid).toBe(0);
});
test("society date recognizes early India morning correctly", () => {
  expect(societyDate(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
  expect(periodCutoff("2026-09","2026-11-02")).toBe("2026-09-30");
  expect(periodCutoff("2026-11","2026-11-02")).toBe("2026-11-02");
});
test("expenses preserve accounting month and legacy date fallback", () => {
  expect(expenseAccountingMonth({expense_month:"2026-09",expense_date:"2026-10-02"})).toBe("2026-09");
  expect(expenseAccountingMonth({expense_month:null,expense_date:"2026-10-02"})).toBe("2026-10");
});
test("suspected matching cash receipts are flagged without removing legitimate records", () => {
  const a={...payment(1500,"2026-10-09"),id:"1",method:"cash",month_covered:"October 2026",reference:null,receipt_no:"LE-1"};
  const rows=[a,{...a,id:"2",receipt_no:"LE-2"},{...a,id:"3",paid_on:"2026-10-10"}];
  expect(suspectedPaymentGroups(rows).map(g=>g.map(p=>p.id))).toEqual([["1","2"]]);
  expect(rows.length).toBe(3);
});