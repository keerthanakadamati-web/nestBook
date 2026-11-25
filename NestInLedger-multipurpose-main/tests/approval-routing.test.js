import { expect, test } from "bun:test";
import { canAddExpenses, canConfirmPayments, canDecideModule } from "../src/lib/permissions";
test("Treasurer, not President, approves money collected", () => {
  expect(canConfirmPayments("treasurer")).toBe(true);
  expect(canConfirmPayments("president")).toBe(false);
  expect(canDecideModule("treasurer", "payments")).toBe(true);
  expect(canDecideModule("president", "payments")).toBe(false);
});
test("President approves expenses; Secretary can approve as backup", () => {
  expect(canDecideModule("president", "expenses")).toBe(true);
  expect(canDecideModule("secretary", "expenses")).toBe(true);
  expect(canDecideModule("treasurer", "expenses")).toBe(false);
});
test("Treasurer can add expenses", () => {
  expect(canAddExpenses("treasurer")).toBe(true);
  expect(canAddExpenses("resident")).toBe(false);
});

test("complaint updates are approved by the President, with the Secretary as backup", () => {
  expect(canDecideModule("president", "complaints")).toBe(true);
  expect(canDecideModule("secretary", "complaints")).toBe(true);
  expect(canDecideModule("treasurer", "complaints")).toBe(false);
  expect(canDecideModule("resident", "complaints")).toBe(false);
});
