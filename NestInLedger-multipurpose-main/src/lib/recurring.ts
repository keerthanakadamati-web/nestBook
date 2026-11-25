export type RecurringSchedule = {
  id: string;
  name: string;
  category: string;
  expected_amount: number;
  due_day: number;
  vendor: string | null;
  start_date: string;
  end_date: string | null;
  frequency: "monthly" | "quarterly" | "annually";
  notes: string | null;
  requires_receipt: boolean;
  status: "active" | "paused" | "ended";
};

export type RecurringEntry = {
  id: string;
  recurring_id: string;
  period: string;
  expected_amount: number;
  status: "planned" | "paid";
  actual_amount: number | null;
  paid_on: string | null;
  payment_reference: string | null;
  method: "cash" | "online" | null;
  notes: string | null;
  expense_id: string | null;
  schedule_snapshot?: RecurringSchedule | null;
};

export type ExpenseAttachment = {
  id: string;
  entry_id: string | null;
  expense_id: string | null;
  schedule_snapshot?: RecurringSchedule | null;
  file_path: string;
  file_name: string;
  file_size: number;
  created_at: string;
};

export const suggestedCategories = [
  "Watchman / Security Guard Salary",
  "Housekeeping / Cleaning Staff Salary",
  "Lift Maintenance / AMC",
  "Common Area Electricity",
  "Water Supply / Water Tankers",
  "Generator / DG Maintenance and Fuel",
  "Garbage Collection",
  "Gardening and Common Area Maintenance",
  "Fire Safety / Equipment Maintenance",
  "Pump, Plumbing and Essential Repairs",
  "Internet / CCTV / Security System Charges",
  "Other recurring apartment expenses",
];

function monthIndex(ym: string): number {
  const [y = 0, m = 0] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Mirrors the database rule for whether a schedule falls due in a month ("YYYY-MM"). */
export function scheduleDueInMonth(s: Pick<RecurringSchedule, "frequency" | "start_date" | "end_date" | "status">, month: string): boolean {
  if (s.status !== "active") return false;
  const start = s.start_date.slice(0, 7);
  if (start > month) return false;
  if (s.end_date && s.end_date.slice(0, 7) < month) return false;
  if (s.frequency === "monthly") return true;
  const diff = monthIndex(month) - monthIndex(start);
  if (s.frequency === "quarterly") return diff % 3 === 0;
  return diff % 12 === 0;
}

/** Due date for a schedule in a month, clamped to the month's last day. */
export function dueDateFor(s: Pick<RecurringSchedule, "due_day">, month: string): string {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(s.due_day, last)).padStart(2, "0")}`;
}

export type EntryDisplayStatus = "Upcoming" | "Due" | "Overdue" | "Paid" | "Awaiting Approval" | "Not created";

export function entryDisplayStatus(
  schedule: RecurringSchedule,
  entry: RecurringEntry | undefined,
  month: string,
  hasPendingProposal: boolean,
  today: string = new Date().toISOString().slice(0, 10),
): EntryDisplayStatus {
  if (entry?.status === "paid") return "Paid";
  if (entry && hasPendingProposal) return "Awaiting Approval";
  if (!entry && !scheduleDueInMonth(schedule, month)) return "Not created";
  const currentMonth = today.slice(0, 7);
  if (month > currentMonth) return "Upcoming";
  if (month < currentMonth) return "Overdue";
  return today <= dueDateFor(schedule, month) ? "Upcoming" : "Due";
}

export const FREQUENCY_LABEL: Record<RecurringSchedule["frequency"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};
