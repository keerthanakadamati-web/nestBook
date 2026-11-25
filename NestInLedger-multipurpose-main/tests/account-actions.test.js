import { test, expect } from "bun:test";
import { assignableRoles, findRegisteredUser, normalizeEmail, passwordConfirmationError } from "../src/lib/account-actions";
test("email lookup finds the exact existing user ID case-insensitively", async () => {
  expect(normalizeEmail(" Owner@Example.com ")).toBe("owner@example.com");
  expect(await findRegisteredUser(" Owner@Example.com ", async () => ({ users: [{ id: "existing-owner-id", email: "owner@example.com" }, { id: "other-id", email: "other@example.com" }], error: false }))).toBe("existing-owner-id");
});
test("missing accounts cannot resolve to another user", async () => {
  expect(await findRegisteredUser("missing@example.com", async () => ({ users: [{ id: "other-id", email: "other@example.com" }], error: false }))).toBeNull();
});
test("registered accounts beyond the first page are resolved", async () => {
  const pages = [];
  const id = await findRegisteredUser("target@example.com", async (page) => { pages.push(page); return { error: false, users: page === 1 ? Array.from({ length: 200 }, (_, i) => ({ id: String(i), email: `user${i}@example.com` })) : [{ id: "actual-target", email: "target@example.com" }] }; });
  expect(id).toBe("actual-target"); expect(pages).toEqual([1, 2]);
});
test("account lookup errors fail closed", async () => {
  await expect(findRegisteredUser("target@example.com", async () => ({ users: [], error: true }))).rejects.toThrow();
});
test("existing five roles are unchanged", () => {
  expect(assignableRoles).toEqual(["admin", "president", "secretary", "treasurer", "resident"]);
});
test("new password must match its confirmation", () => {
  expect(passwordConfirmationError("A-new-secret", "A-different-secret")).not.toBeNull();
  expect(passwordConfirmationError("A-new-secret", "A-new-secret")).toBeNull();
  expect(passwordConfirmationError("", "")).not.toBeNull();
});