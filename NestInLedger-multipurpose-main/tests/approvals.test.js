import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";

test("Secretary proposals: create, edit, delete, approve, reject, replay, conflicts and isolation", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Approval tests require backend test configuration");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = {}, clients = {}, proposalIds = [], recordIds = { flats: [], expenses: [], announcements: [], payments: [] };
  const create = async (role) => {
    const email = `approval-${crypto.randomUUID()}@example.com`, password = `X!${crypto.randomUUID()}a9`;
    const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error || !res.data.user) throw new Error("Test account setup failed");
    ids[role] = res.data.user.id;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error("Test sign-in failed");
    clients[role] = client;
    if ((await admin.from("user_roles").insert({ user_id: ids[role], role })).error) throw new Error("Test role setup failed");
  };
  const submit = async (module, action, key, values) => {
    const r = await clients.secretary.rpc("submit_change", { _module: module, _action: action, _key: key, _values: values });
    expect(r.error).toBeNull();
    if (!r.data) throw new Error("Missing proposal");
    proposalIds.push(r.data);
    return (await admin.from("change_proposals").select("*").eq("id", r.data).single()).data;
  };
  const decide = (p, approve, comment = "Test review", c = clients.president, extra = {}) => c.rpc("decide_change", { _id: p.id, _approve: approve, _comment: comment, ...extra });
  try {
    for (const role of ["president", "secretary", "treasurer", "resident", "admin"]) await create(role);
    // All real data remains untouched: fixtures are isolated and notifications disabled.
    const flat = await submit("flats", "create", "", { flat_number: "approval-" + crypto.randomUUID(), resident_name: "Approval test", mobile: "0000000000", billing_start: "2099-01-01" });
    recordIds.flats.push(flat.record_key);
    expect((await clients.admin.from("change_proposals").select("id").eq("id", flat.id)).data.map((p) => p.id)).toEqual([flat.id]);
    expect((await clients.admin.from("change_audit").select("event").eq("proposal_id", flat.id)).data.map((a) => a.event)).toEqual(["submitted"]);
    expect((await admin.from("flats").select("id").eq("id", flat.record_key)).data.length).toBe(0);
    for (const role of ["secretary", "treasurer", "resident", "admin"]) expect((await decide(flat, true, "", clients[role])).error).not.toBeNull();
    expect((await decide(flat, true)).error).toBeNull();
    expect((await decide(flat, true)).error).not.toBeNull();
    expect((await admin.from("flats").select("resident_name").eq("id", flat.record_key).single()).data.resident_name).toBe("Approval test");
    const edit = await submit("flats", "update", flat.record_key, { resident_name: "Proposed owner", occupancy: "rented", tenant_name: "Test tenant" });
    expect((await admin.from("flats").select("resident_name").eq("id", flat.record_key).single()).data.resident_name).toBe("Approval test");
    expect((await clients.secretary.rpc("submit_change", { _module: "flats", _action: "delete", _key: flat.record_key, _values: {} })).error).not.toBeNull();
    expect((await decide(edit, false, "")).error).not.toBeNull();
    expect((await decide(edit, false, "Keep current owner")).error).toBeNull();
    expect((await clients.secretary.from("change_proposals").select("review_comment").eq("id", edit.id).single()).data.review_comment).toBe("Keep current owner");
    const edit2 = await submit("flats", "update", flat.record_key, { mobile: "1111111111" });
    expect((await decide(edit2, true)).error).toBeNull();
    expect((await admin.from("flats").select("mobile").eq("id", flat.record_key).single()).data.mobile).toBe("1111111111");
    const conflict = await submit("flats", "update", flat.record_key, { mobile: "2222222222" });
    await admin.from("flats").update({ mobile: "3333333333" }).eq("id", flat.record_key);
    expect((await decide(conflict, true)).error).not.toBeNull();
    expect((await decide(conflict, false)).error).toBeNull();
    // Every existing writable administrative module supports reviewed application.
    for (const [module, values, update] of [
      ["expenses", { category: "Approval test", amount: 1, expense_month: "2099-01" }, { amount: 2 }],
      ["announcements", { title: "Approval test", category: "Meetings", published: false }, { description: "Reviewed description" }],
      ["payments", { flat_id: flat.record_key, amount: 1, method: "upi", status: "pending", paid_on: "2099-01-01" }, { notes: "Reviewed reference" }],
    ]) {
      const p = await submit(module, "create", "", values); recordIds[module].push(p.record_key);
      expect((await admin.from(module).select("id").eq("id", p.record_key)).data.length).toBe(0);
      expect((await decide(p, true)).error).toBeNull();
      const u = await submit(module, "update", p.record_key, update);
      expect((await decide(u, true)).error).toBeNull();
      const d = await submit(module, "delete", p.record_key, {});
      expect((await admin.from(module).select("id").eq("id", p.record_key)).data.length).toBe(1);
      expect((await decide(d, true)).error).toBeNull();
      expect((await admin.from(module).select("id").eq("id", p.record_key)).data.length).toBe(0);
    }
    const settings = (await admin.from("society_settings").select("upi_id").eq("id", true).single()).data;
    const setting = await submit("society_settings", "update", "true", { upi_id: settings.upi_id });
    expect((await decide(setting, true)).error).toBeNull();
    const fy = "2198";
    const fund = await submit("fund_years", "create", fy, { opening_balance: 12 });
    expect((await decide(fund, true)).error).toBeNull();
    expect((await admin.from("fund_years").select("opening_balance").eq("fy_start", 2198).single()).data.opening_balance).toBe(12);
    const fundDelete = await submit("fund_years", "delete", fy, {}); expect((await decide(fundDelete, true)).error).toBeNull();
    const roleChange = await submit("user_roles", "set_role", ids.resident, { role: "treasurer" });
    expect((await decide(roleChange, true)).error).toBeNull();
    expect((await admin.from("user_roles").select("role").eq("user_id", ids.resident).single()).data.role).toBe("treasurer");
    // Own approval remains forbidden even if a second role is subsequently assigned.
    const self = await submit("flats", "update", flat.record_key, { mobile: "4444444444" });
    await admin.from("user_roles").insert({ user_id: ids.secretary, role: "president" });
    expect((await decide(self, true, "", clients.secretary)).error).not.toBeNull();
    await admin.from("user_roles").delete().eq("user_id", ids.secretary).eq("role", "president");
    expect((await decide(self, false)).error).toBeNull();
    for (const role of ["treasurer", "resident", "admin"]) {
      if (role !== "admin") expect((await clients[role].from("change_proposals").select("id")).data.length).toBe(0);
      expect((await clients[role].rpc("submit_change", { _module: "flats", _action: "update", _key: flat.record_key, _values: { mobile: "bad" } })).error).not.toBeNull();
    }
    await clients.secretary.from("change_proposals").update({ status: "approved" }).eq("id", self.id);
    expect((await admin.from("change_proposals").select("status").eq("id", self.id).single()).data.status).toBe("rejected");
    expect((await clients.secretary.from("change_audit").insert({ proposal_id: self.id, event: "applied", actor_id: ids.secretary })).error).not.toBeNull();
    for (const module of ["flats", "payments", "expenses", "announcements", "fund_years", "society_settings", "user_roles"]) {
      const values = { flats: { flat_number: crypto.randomUUID(), resident_name: "bad", mobile: "0" }, payments: { flat_id: flat.record_key, amount: 1, method: "cash" }, expenses: { amount: 1, category: "bad" }, announcements: { title: "bad", category: "Meetings" }, fund_years: { fy_start: 2197 }, society_settings: { id: false }, user_roles: { user_id: ids.secretary, role: "president" } };
      expect((await clients.secretary.from(module).insert(values[module])).error).not.toBeNull();
    }
    expect((await clients.secretary.rpc("submit_change", { _module: "internal_tokens", _action: "update", _key: "x", _values: { token: "bad" } })).error).not.toBeNull();
    expect((await clients.secretary.rpc("submit_change", { _module: "flats", _action: "update", _key: flat.record_key, _values: { id: crypto.randomUUID() } })).error).not.toBeNull();
    const deletion = await submit("flats", "delete", flat.record_key, {});
    expect((await admin.from("flats").select("id").eq("id", flat.record_key)).data.length).toBe(1);
    const decisions = await Promise.all([decide(deletion, true), decide(deletion, true)]);
    expect(decisions.filter((d) => !d.error).length).toBe(1);
    expect((await admin.from("flats").select("id").eq("id", flat.record_key)).data.length).toBe(0);
    expect((await clients.president.from("change_audit").select("event").eq("proposal_id", deletion.id)).data.map((a) => a.event).sort()).toEqual(["applied", "approved", "submitted"]);
  } finally {
    for (const [module, rows] of Object.entries(recordIds).reverse()) for (const id of rows) {
      const r = await admin.from(module).delete().eq("id", id); if (r.error) throw new Error("Test record cleanup failed: " + module);
    }
    await admin.from("fund_years").delete().eq("fy_start", 2198);
    for (const id of proposalIds) { await admin.from("change_audit").delete().eq("proposal_id", id); await admin.from("change_proposals").delete().eq("id", id); }
    for (const id of Object.values(ids)) { await admin.from("user_roles").delete().eq("user_id", id); if ((await admin.auth.admin.deleteUser(id)).error) throw new Error("Test account cleanup failed"); }
  }
}, 300000);