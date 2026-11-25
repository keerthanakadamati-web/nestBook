import { z } from "zod";

export const complaintStatuses = ["Submitted", "Under Review", "Assigned", "In Progress", "Awaiting Approval", "Resolved", "Reopened"] as const;
export const complaintCategories = ["Maintenance & Repairs", "Water", "Electricity", "Cleanliness", "Security", "Other"] as const;
export const complaintPriorities = ["Normal", "High", "Urgent"] as const;
export const complaintInput = z.object({ flatId: z.string().uuid(), title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(10000), category: z.enum(complaintCategories), requestId: z.string().uuid() });
export function isOverdue(complaint: { due_on: string | null; status: string }, today: string) {
  return complaint.due_on !== null && complaint.due_on < today && complaint.status !== "Resolved";
}
export function complaintMatches(complaint: { status: string; category: string; priority: string; flat_id: string; submitted_at: string }, filters: { status: string; category: string; priority: string; flat: string; date: string }) {
  return (!filters.status || complaint.status === filters.status) && (!filters.category || complaint.category === filters.category) && (!filters.priority || complaint.priority === filters.priority) && (!filters.flat || complaint.flat_id === filters.flat) && (!filters.date || complaint.submitted_at.slice(0, 10) === filters.date);
}