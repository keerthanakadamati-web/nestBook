import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { canWriteLive, isCommittee, primaryRole } from "../src/lib/permissions";
test("existing admin and President retain live-write access", () => {
  expect(canWriteLive("admin")).toBe(true);
  expect(canWriteLive("president")).toBe(true);
});
test("Secretary and Treasurer cannot write live records", () => {
  expect(canWriteLive("secretary")).toBe(false);
  expect(canWriteLive("treasurer")).toBe(false);
});
test("owner navigation remains separate", () => {
  expect(isCommittee("resident")).toBe(false);
  expect(primaryRole([{ role: "secretary" }, { role: "resident" }])).toBe("secretary");
});
const url = process.env.SUPABASE_URL;
describe.skipIf(!url)("database permission foundation (temporary accounts removed)", () => {
  test("role matrix, direct writes, owner isolation and privileged RPCs", async () => {
    if (!url)
      throw new Error("Missing test connection");
    const backend = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!backend || !key)
      throw new Error("Missing test auth configuration");
    const admin = createClient(backend, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ids = {};
    const clients = {};
    const flatId = crypto.randomUUID();
    try {
      for (const role of ["admin", "president", "secretary", "treasurer", "resident", "other"]) {
        const email = `permissions-${crypto.randomUUID()}@example.com`;
        const password = `N!${crypto.randomUUID()}a9`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (created.error || !created.data.user)
          throw new Error("Could not create isolated test account");
        ids[role] = created.data.user.id;
        const client = createClient(backend, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const signed = await client.auth.signInWithPassword({ email, password });
        if (signed.error)
          throw new Error("Could not sign in isolated test account");
        clients[role] = client;
        if (role !== "other") {
          const inserted = await admin.from("user_roles").insert({ user_id: ids[role], role });
          if (inserted.error)
            throw new Error("Test role setup failed");
        }
      }
      const fixture = await admin.from("flats").insert({ id: flatId, flat_number: "test-" + flatId, resident_name: "Permission test", mobile: "0000000000", resident_user_id: ids.resident });
      if (fixture.error)
        throw new Error("Test flat setup failed");
      const clientFor = (role) => {
        const client = clients[role];
        if (!client)
          throw new Error("Missing isolated test account");
        return client;
      };
      for (const role of ["admin", "president"]) {
        const c = clientFor(role);
        for (const permission of ["admin.write", "finance.write", "roles.manage"])
          expect((await c.rpc("has_permission", { _permission: permission })).data).toBe(true);
        const changed = await c.from("flats").update({ mobile: "0000000000" }).eq("id", flatId).select("id");
        expect(changed.error).toBeNull();
        expect(changed.data?.length).toBe(1);
        expect((await c.rpc("set_committee_role", { _user_id: ids[role], _role: "resident" })).error).not.toBeNull();
      }
      for (const role of ["secretary", "treasurer"]) {
        const c = clientFor(role);
        await admin.from("flats").update({ resident_user_id: ids[role] }).eq("id", flatId);
        expect((await c.rpc("has_permission", { _permission: "admin.read" })).data).toBe(role === "secretary");
        expect((await c.rpc("has_permission", { _permission: "finance.read" })).data).toBe(true);
        for (const permission of ["finance.write", "changes.approve", "roles.manage"])
          expect((await c.rpc("has_permission", { _permission: permission })).data).toBe(false);
        expect((await c.from("finance_accounts").select("id").eq("id", flatId)).data?.length).toBe(1);
        expect((await c.from("flats").select("id").eq("id", flatId)).data?.length).toBe(role === "secretary" ? 1 : 0);
        expect((await c.from("flats").update({ mobile: "bad" }).eq("id", flatId).select("id")).data?.length).toBe(0);
        expect((await c.from("expenses").insert({ category: "permission test", amount: 1 })).error).not.toBeNull();
        expect((await c.rpc("set_committee_role", { _user_id: ids.resident, _role: "president" })).error).not.toBeNull();
        expect((await c.rpc("claim_first_admin")).data).toBe(false);
        expect((await c.rpc("update_my_flat_tenant", { _flat_id: flatId, _occupancy: "owner", _tenant_name: "", _tenant_phone: "", _tenant_email: "" })).error).not.toBeNull();
        expect((await c.from("payments").insert({ flat_id: flatId, amount: 1, method: "upi", status: "pending" })).error).not.toBeNull();
      }
      await admin.from("flats").update({ resident_user_id: ids.resident }).eq("id", flatId);
      const owner = clientFor("resident");
      expect((await owner.from("flats").select("id").eq("id", flatId)).data?.length).toBe(1);
      expect((await owner.from("finance_accounts").select("id")).data?.length).toBe(0);
      expect((await owner.from("expenses").select("id")).data?.length).toBe(0);
      expect((await owner.rpc("update_my_flat_tenant", { _flat_id: flatId, _occupancy: "owner", _tenant_name: "", _tenant_phone: "", _tenant_email: "" })).error).toBeNull();
      expect((await owner.from("payments").insert({ flat_id: flatId, amount: 1, method: "upi", status: "pending" })).error).toBeNull();
      const other = clientFor("other");
      expect((await other.from("flats").select("id").eq("id", flatId)).data?.length).toBe(0);
      expect((await other.from("payments").select("id").eq("flat_id", flatId)).data?.length).toBe(0);
      expect((await other.from("payments").insert({ flat_id: flatId, amount: 1, method: "upi", status: "pending" })).error).not.toBeNull();
      expect((await other.rpc("update_my_flat_tenant", { _flat_id: flatId, _occupancy: "owner", _tenant_name: "", _tenant_phone: "", _tenant_email: "" })).error).not.toBeNull();
      expect((await clientFor("president").rpc("set_committee_role", { _user_id: ids.other, _role: "secretary" })).error).toBeNull();
      expect((await other.rpc("has_permission", { _permission: "admin.read" })).data).toBe(true);
    } finally {
      const paymentCleanup = await admin.from("payments").delete().eq("flat_id", flatId);
      const flatCleanup = await admin.from("flats").delete().eq("id", flatId);
      if (paymentCleanup.error || flatCleanup.error) throw new Error("Test record cleanup failed");
      for (const id of Object.values(ids)) {
        await admin.from("user_roles").delete().eq("user_id", id);
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error)
          throw new Error("Test account cleanup failed");
      }
    }
  }, 120000);
});
