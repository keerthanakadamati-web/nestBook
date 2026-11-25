import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { roleLabel } from "../src/lib/permissions";

test("role labels are human readable", () => {
  expect(roleLabel("admin")).toBe("Administrator");
  expect(roleLabel("president")).toBe("President");
  expect(roleLabel("secretary")).toBe("Secretary");
  expect(roleLabel("treasurer")).toBe("Treasurer");
  expect(roleLabel("resident")).toBe("Owner");
  expect(roleLabel(null)).toBe("");
});

const url = process.env.SUPABASE_URL;
describe.skipIf(!url)("display-name profiles (temporary accounts removed)", () => {
  test("profile backfill, owner isolation and committee read access", async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing test auth configuration");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ids = {};
    const clients = {};
    const flatId = crypto.randomUUID();
    try {
      for (const role of ["resident", "secretary", "treasurer", "other"]) {
        const email = `profiles-${crypto.randomUUID()}@example.com`;
        const password = `N!${crypto.randomUUID()}a9`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (created.error || !created.data.user) throw new Error("Could not create isolated test account");
        ids[role] = created.data.user.id;
        const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const signed = await client.auth.signInWithPassword({ email, password });
        if (signed.error) throw new Error("Could not sign in isolated test account");
        clients[role] = client;
        if (role !== "other") {
          const inserted = await admin.from("user_roles").insert({ user_id: ids[role], role });
          if (inserted.error) throw new Error("Test role setup failed");
        }
      }
      const fixture = await admin.from("flats").insert({ id: flatId, flat_number: "test-" + flatId, resident_name: "Profile Test Owner", mobile: "0000000000", resident_user_id: ids.resident });
      if (fixture.error) throw new Error("Test flat setup failed");

      // Owner can create and read their own display name.
      const upsert = await clients.resident.from("profiles").upsert({ user_id: ids.resident, full_name: "Profile Test Owner" }, { onConflict: "user_id" });
      expect(upsert.error).toBeNull();
      const own = await clients.resident.from("profiles").select("full_name").eq("user_id", ids.resident);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(own.data[0].full_name).toBe("Profile Test Owner");

      // Owner can update their own name.
      const rename = await clients.resident.from("profiles").update({ full_name: "Renamed Owner" }).eq("user_id", ids.resident);
      expect(rename.error).toBeNull();

      // Residents and Treasurers cannot read another user's profile.
      const otherRead = await clients.other.from("profiles").select("full_name").eq("user_id", ids.resident);
      expect(otherRead.data ?? []).toHaveLength(0);
      const treasurerRead = await clients.treasurer.from("profiles").select("full_name").eq("user_id", ids.resident);
      expect(treasurerRead.data ?? []).toHaveLength(0);

      // Residents cannot write another user's profile.
      const foreignWrite = await clients.other.from("profiles").upsert({ user_id: ids.resident, full_name: "Forged" }, { onConflict: "user_id" });
      expect(foreignWrite.error).not.toBeNull();

      // Committee (Secretary) can read profiles to maintain names.
      const committeeRead = await clients.secretary.from("profiles").select("full_name").eq("user_id", ids.resident);
      expect(committeeRead.error).toBeNull();
      expect(committeeRead.data).toHaveLength(1);
      expect(committeeRead.data[0].full_name).toBe("Renamed Owner");

      // Existing flat owner names are backfilled for linked logins.
      const backfilled = await admin.from("profiles").select("full_name").eq("user_id", ids.resident).single();
      expect(backfilled.data.full_name).toBe("Renamed Owner");
    } finally {
      await admin.from("profiles").delete().in("user_id", Object.values(ids));
      await admin.from("flats").delete().eq("id", flatId);
      for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
    }
  }, 60000);
});
