import { expect, test } from "bun:test";
import { maintenanceStatement, monthBounds } from "../src/lib/maintenance";
const flat = { id: "flat", billing_start: "2026-01-01" };
const payment = (amount, paid_on, status = "confirmed") => ({ flat_id: "flat", amount, paid_on, status });
test("monthly due date is the first and existing billing remains 1500", () => {
  expect(maintenanceStatement(flat, [], "2026-02")).toMatchObject({ billed: 1500, previous: 1500, outstanding: 3000, paid: 0, status: "outstanding", dueDate: "2026-02-01" });
});
test("confirmed partial payments clear oldest dues first", () => {
  const s = maintenanceStatement(flat, [payment(500, "2026-02-10")], "2026-02");
  expect(s.previous).toBe(1000); expect(s.outstanding).toBe(2500); expect(s.status).toBe("partial");
});
test("pending online payments never reduce dues", () => {
  expect(maintenanceStatement(flat, [payment(3000, "2026-02-10", "pending")], "2026-02").outstanding).toBe(3000);
});
test("later payments do not change historical statements", () => {
  expect(maintenanceStatement(flat, [payment(3000, "2026-03-01")], "2026-02").outstanding).toBe(3000);
});
test("full confirmed payment clears dues", () => {
  expect(maintenanceStatement(flat, [payment(3000, "2026-02-10")], "2026-02").status).toBe("paid");
});
test("no bills before billing start and December advances into next year", () => {
  expect(maintenanceStatement(flat, [], "2025-12").billed).toBe(0);
  expect(monthBounds("2026-12").next).toBe("2027-01-01");
});