export const assignableRoles = ["admin", "president", "secretary", "treasurer", "resident"] as const;
export type AssignableRole = typeof assignableRoles[number];
export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function passwordConfirmationError(password: string, confirmation: string) {
  if (!password) return "Enter a new password.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
export async function findRegisteredUser(email: string, list: (page: number) => Promise<{ users: { id: string; email?: string }[]; error: boolean }>) {
  const normalized = normalizeEmail(email);
  for (let page = 1; ; page++) {
    const result = await list(page);
    if (result.error) throw new Error("Could not check registered accounts. Please try again.");
    const user = result.users.find((u) => normalizeEmail(u.email ?? "") === normalized);
    if (user) return user.id;
    if (result.users.length < 200) return null;
  }
}