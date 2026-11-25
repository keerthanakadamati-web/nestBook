import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, unlink } from "node:fs/promises";

test("administrative sidebar access preserves Secretary approval and finance/owner boundaries", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing secure test configuration");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = [], sessions = {}, clients = {};
  const id = crypto.randomUUID(), flatNumber = `sidebar-${id}`;
  const secretPath = `/tmp/browser/sidebar-access-${id}.json`;
  try {
    for (const role of ["admin", "president", "secretary", "treasurer", "resident"]) {
      const email = `sidebar-${crypto.randomUUID()}@example.com`, password = `N!${crypto.randomUUID()}a9`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Could not create test account");
      ids.push(created.data.user.id);
      expect((await admin.from("user_roles").insert({ user_id: created.data.user.id, role })).error).toBeNull();
      const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await c.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session) throw new Error("Could not sign in test account");
      clients[role] = c; sessions[role] = login.data.session;
    }
    expect((await admin.from("flats").insert({ id, flat_number: flatNumber, resident_name: "Sidebar test owner", mobile: "0000000000", billing_start: "2026-01-01", occupancy: "rented", tenant_name: "Original tenant", tenant_phone: "0000000000" })).error).toBeNull();
    expect((await admin.from("payments").insert({ flat_id: id, amount: 500, method: "upi", status: "pending", paid_on: new Date().toISOString().slice(0,10), reference: `test-${id}` })).error).toBeNull();
    // A pending row gives President and Admin real history to read.
    const initial = await clients.secretary.rpc("submit_change", { _module: "flats", _action: "create", _key: "", _values: { flat_number: `pending-${id}`, resident_name: "Pending owner", mobile: "0000000000", billing_start: "2099-01-01" } });
    expect(initial.error).toBeNull();
    const report = await clients.treasurer.rpc("prepare_financial_report", { _type: "monthly", _start: "2026-02-01" });
    expect(report.error).toBeNull();
    expect((await clients.treasurer.rpc("transition_financial_report", { _id: report.data, _action: "submit" })).error).toBeNull();
    await mkdir('/tmp/browser', { recursive: true });
    const project = new URL(url).hostname.split('.')[0];
    await writeFile(secretPath, JSON.stringify({ sessions, flatNumber, flatId: id, reportId: report.data, storageKey: `sb-${project}-auth-token` }), { mode: 0o600 });
    const child = Bun.spawn(["python3", "tests/sidebar-browser.py", secretPath], { stdout: "inherit", stderr: "inherit" });
    expect(await child.exited).toBe(0);
    const live = await admin.from("flats").select("tenant_name").eq("id", id).single();
    expect(live.data?.tenant_name).toBe("Original tenant");
    const proposal = await clients.secretary.from("change_proposals").select("id,status,proposed_values").eq("record_key", id).single();
    expect(proposal.data?.status).toBe("pending");
    expect(proposal.data?.proposed_values.tenant_name).toBe("Proposed tenant");
    for (const role of ["admin", "president", "secretary"]) expect((await clients[role].rpc("has_permission", { _permission: "admin.read" })).data).toBe(true);
    for (const role of ["treasurer", "resident"]) {
      expect((await clients[role].rpc("has_permission", { _permission: "admin.read" })).data).toBe(false);
      expect((await clients[role].from("flats").select("id").eq("id", id)).data).toEqual([]);
      expect((await clients[role].from("change_proposals").select("id").eq("record_key", id)).data).toEqual([]);
    }
    expect((await clients.admin.rpc("decide_change", { _id: proposal.data.id, _approve: true, _comment: "test" })).error).not.toBeNull();
    expect((await clients.president.rpc("decide_change", { _id: proposal.data.id, _approve: true, _comment: "test" })).error).toBeNull();
    expect((await admin.from("flats").select("tenant_name").eq("id", id).single()).data?.tenant_name).toBe("Proposed tenant");
  } finally {
    await unlink(secretPath).catch(() => {});
    for (const userId of ids) {
      expect((await admin.from("financial_reports").delete().eq("prepared_by", userId)).error).toBeNull();
      const { data: proposals } = await admin.from("change_proposals").select("id").eq("submitted_by", userId);
      for (const p of proposals ?? []) {
        expect((await admin.from("change_audit").delete().eq("proposal_id", p.id)).error).toBeNull();
        expect((await admin.from("change_proposals").delete().eq("id", p.id)).error).toBeNull();
      }
    }
    expect((await admin.from("payments").delete().eq("flat_id", id)).error).toBeNull();
    expect((await admin.from("flats").delete().eq("id", id)).error).toBeNull();
    for (const userId of ids) {
      expect((await admin.from("user_roles").delete().eq("user_id", userId)).error).toBeNull();
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  }
}, 300000);