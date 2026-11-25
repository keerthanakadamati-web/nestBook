export type Role = "admin" | "president" | "secretary" | "treasurer" | "resident" | null;
export const committeeRoles = ["admin", "president", "secretary", "treasurer"] as const;
export function isCommittee(role: Role) { return role !== null && role !== "resident"; }
export function canWriteLive(role: Role) { return role === "admin" || role === "president"; }
export function canSubmitChanges(role: Role) { return canWriteLive(role) || role === "secretary"; }
export function canConfirmPayments(role: Role) { return role === "treasurer" || role === "admin"; }
export function canAddExpenses(role: Role) { return canSubmitChanges(role) || role === "treasurer"; }
export function primaryRole(roles: { role: string }[]): Role {
  for (const role of [...committeeRoles, "resident"] as const) {
    if (roles.some((r) => r.role === role)) return role;
  }
  return "resident";
}
export function roleLabel(role: Role): string {
  if (role === "admin") return "Administrator";
  if (role === "president") return "President";
  if (role === "secretary") return "Secretary";
  if (role === "treasurer") return "Treasurer";
  if (role === "resident") return "Owner";
  return "";
}/** Mirrors database can_decide_module: Treasurer approves money collected; President (or Secretary as backup) approves expenses. */
export function canDecideModule(role: Role, module: string) {
  if (module === "payments") return role === "treasurer" || role === "admin";
  if (module === "expenses" || module === "complaints") return role === "president" || role === "secretary";
  return role === "president";
}
