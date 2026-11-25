import { test, expect } from "bun:test";
import { scheduleDueInMonth, dueDateFor, entryDisplayStatus } from "../src/lib/recurring";

const base = { frequency: "monthly", start_date: "2026-01-15", end_date: null, status: "active", due_day: 5 };

test("scheduleDueInMonth matches frequency, start and end boundaries", () => {
  expect(scheduleDueInMonth(base, "2026-01")).toBe(true);
  expect(scheduleDueInMonth(base, "2025-12")).toBe(false);
  expect(scheduleDueInMonth({ ...base, status: "paused" }, "2026-06")).toBe(false);
  expect(scheduleDueInMonth({ ...base, status: "ended" }, "2026-06")).toBe(false);
  expect(scheduleDueInMonth({ ...base, end_date: "2026-03-31" }, "2026-03")).toBe(true);
  expect(scheduleDueInMonth({ ...base, end_date: "2026-03-31" }, "2026-04")).toBe(false);
  const quarterly = { ...base, frequency: "quarterly", start_date: "2026-01-10" };
  expect(scheduleDueInMonth(quarterly, "2026-04")).toBe(true);
  expect(scheduleDueInMonth(quarterly, "2026-05")).toBe(false);
  expect(scheduleDueInMonth(quarterly, "2026-07")).toBe(true);
  const annually = { ...base, frequency: "annually", start_date: "2026-02-01" };
  expect(scheduleDueInMonth(annually, "2027-02")).toBe(true);
  expect(scheduleDueInMonth(annually, "2027-03")).toBe(false);
});

test("dueDateFor clamps the due day to the month's last day", () => {
  expect(dueDateFor({ due_day: 5 }, "2026-10")).toBe("2026-10-05");
  expect(dueDateFor({ due_day: 31 }, "2026-02")).toBe("2026-02-28");
  expect(dueDateFor({ due_day: 31 }, "2026-04")).toBe("2026-04-30");
});

test("entryDisplayStatus covers Paid, Awaiting Approval, Upcoming, Due, Overdue and Not created", () => {
  const schedule = { ...base, expected_amount: 1000 };
  const planned = { status: "planned" };
  const paid = { status: "paid" };
  expect(entryDisplayStatus(schedule, paid, "2026-10", false, "2026-10-20")).toBe("Paid");
  expect(entryDisplayStatus(schedule, planned, "2026-10", true, "2026-10-20")).toBe("Awaiting Approval");
  expect(entryDisplayStatus(schedule, planned, "2026-10", false, "2026-10-03")).toBe("Upcoming");
  expect(entryDisplayStatus(schedule, planned, "2026-10", false, "2026-10-20")).toBe("Due");
  expect(entryDisplayStatus(schedule, planned, "2026-09", false, "2026-10-20")).toBe("Overdue");
  expect(entryDisplayStatus(schedule, undefined, "2026-11", false, "2026-10-20")).toBe("Upcoming");
  expect(entryDisplayStatus({ ...schedule, status: "paused" }, undefined, "2026-10", false, "2026-10-20")).toBe("Not created");
});
