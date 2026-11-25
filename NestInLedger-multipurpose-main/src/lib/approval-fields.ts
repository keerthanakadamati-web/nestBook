import type { ApprovalModule } from "./approval";
export const approvalModules: { value: ApprovalModule; label: string; fields: { key: string; label: string; type?: string; options?: string[] }[] }[] = [
  { value: "gallery_albums", label: "Event photo albums", fields: [
    { key: "event_name", label: "Event name" }, { key: "event_date", label: "Event date", type: "date" }, { key: "description", label: "Description" }, { key: "published", label: "Published", options: ["true", "false"] }, { key: "cover_photo_id", label: "Cover photo" }, { key: "deleted", label: "Removed", options: ["true", "false"] },
  ] },
  { value: "gallery_photos", label: "Event photos", fields: [{ key: "album_id", label: "Album" }, { key: "upload_id", label: "Verified upload" }, { key: "deleted", label: "Removed", options: ["true", "false"] }] },
  { value: "gallery_budget", label: "Gallery storage budget", fields: [{ key: "budget_bytes", label: "Application budget (bytes)", type: "number" }] },
  { value: "complaints", label: "Complaints", fields: [
    { key: "category", label: "Category", options: ["Maintenance & Repairs", "Water", "Electricity", "Cleanliness", "Security", "Other"] },
    { key: "status", label: "Status", options: ["Submitted", "Under Review", "Assigned", "In Progress", "Awaiting Approval", "Resolved", "Reopened"] },
    { key: "priority", label: "Priority", options: ["Normal", "High", "Urgent"] }, { key: "assigned_to", label: "Assigned person" },
    { key: "due_on", label: "Due date", type: "date" }, { key: "progress_update", label: "Committee response" }, { key: "resolution_details", label: "Resolution details" },
  ] },
  { value: "flats", label: "Flats, owners and tenants", fields: [
    { key: "flat_number", label: "Flat number" }, { key: "resident_name", label: "Owner name" }, { key: "mobile", label: "Owner mobile" },
    { key: "billing_start", label: "Billing start", type: "date" }, { key: "resident_user_id", label: "Linked owner account ID" },
    { key: "occupancy", label: "Occupancy", options: ["owner", "rented"] }, { key: "tenant_name", label: "Tenant name" }, { key: "tenant_phone", label: "Tenant phone" },
    { key: "tenant_email", label: "Tenant email", type: "email" }, { key: "tenant_start", label: "Tenant start date", type: "date" }, { key: "tenant_end", label: "Tenant end date", type: "date" },
  ] },
  { value: "payments", label: "Payments and receipt details", fields: [
    { key: "flat_id", label: "Flat ID" }, { key: "amount", label: "Amount", type: "number" }, { key: "method", label: "Method", options: ["cash", "upi"] },
    { key: "status", label: "Status", options: ["pending", "confirmed", "rejected"] }, { key: "paid_on", label: "Payment date", type: "date" },
    { key: "month_covered", label: "Month covered" }, { key: "reference", label: "Payment reference" }, { key: "notes", label: "Notes" },
  ] },
  { value: "expenses", label: "Expenses", fields: [
    { key: "expense_date", label: "Expense date", type: "date" }, { key: "expense_month", label: "Expense month", type: "month" },
    { key: "category", label: "Category" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", type: "number" },
    { key: "paid_by", label: "Paid by" }, { key: "method", label: "Method", options: ["cash", "online"] }, { key: "notes", label: "Notes" },
  ] },
  { value: "announcements", label: "Announcements and meetings", fields: [
    { key: "title", label: "Title" }, { key: "category", label: "Category", options: ["Meetings", "Maintenance & Repairs", "Important Notices", "Events", "Urgent Notices"] },
    { key: "description", label: "Description" }, { key: "event_date", label: "Date", type: "date" }, { key: "event_time", label: "Time", type: "time" },
    { key: "location", label: "Location" }, { key: "expires_on", label: "Expiry date", type: "date" }, { key: "published", label: "Published", options: ["true", "false"] },
  ] },
  { value: "fund_years", label: "Corporate Fund", fields: [{ key: "opening_balance", label: "Opening balance", type: "number" }] },
  { value: "society_settings", label: "Maintenance and society settings", fields: [
    { key: "society_name", label: "Apartment name" }, { key: "monthly_amount", label: "Monthly maintenance", type: "number" },
    { key: "upi_id", label: "UPI ID" }, { key: "payee_name", label: "Payee name" },
    { key: "effective_month", label: "Effective month", type: "date" }, { key: "due_day", label: "Monthly due day", type: "number" }, { key: "fy_start_month", label: "Financial year start month", type: "number" },
    { key: "reminders_enabled", label: "Automatic reminders", options: ["true", "false"] }, { key: "reminder_start_day", label: "Reminder start day", type: "number" },
    { key: "reminder_time", label: "Reminder time", type: "time" }, { key: "reminder_timezone", label: "Time zone" }, { key: "payment_notifications", label: "Payment confirmation emails", options: ["true", "false"] },
  ] },
  { value: "user_roles", label: "User roles", fields: [{ key: "role", label: "Role", options: ["resident", "secretary", "treasurer", "president"] }] },
  { value: "recurring_expenses", label: "Recurring expenses", fields: [
    { key: "name", label: "Expense name" }, { key: "category", label: "Category" }, { key: "expected_amount", label: "Expected monthly amount", type: "number" },
    { key: "due_day", label: "Due day", type: "number" }, { key: "vendor", label: "Vendor or employee" },
    { key: "start_date", label: "Start date", type: "date" }, { key: "end_date", label: "End date", type: "date" },
    { key: "frequency", label: "Frequency", options: ["monthly", "quarterly", "annually"] }, { key: "notes", label: "Notes" },
    { key: "requires_receipt", label: "Bill or receipt required", options: ["true", "false"] }, { key: "status", label: "Status", options: ["active", "paused", "ended"] },
  ] },
  { value: "recurring_entries", label: "Recurring expense payments", fields: [
    { key: "expected_amount", label: "Expected amount", type: "number" }, { key: "status", label: "Status", options: ["planned", "paid"] },
    { key: "actual_amount", label: "Actual amount paid", type: "number" }, { key: "paid_on", label: "Payment date", type: "date" },
    { key: "payment_reference", label: "Payment reference" }, { key: "method", label: "Method", options: ["cash", "online"] }, { key: "notes", label: "Notes" },
  ] },
];