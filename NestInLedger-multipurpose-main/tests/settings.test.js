import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";

test("settings approvals, future bills, reminder time, paid stopping and duplicate prevention", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.SUPABASE_DB_URL) throw new Error("Settings test access required");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1 });
  const ids = {}, clients = {}, sessions = {}, proposals = [];
  const original = (await admin.from("society_settings").select("*").eq("id", true).single()).data;
  const billsBefore = (await admin.from("maintenance_bills").select("*").order("id")).data;
  const flat = crypto.randomUUID();
  const ok = async (promise) => { const r = await promise; if (r.error) throw new Error(r.error.message); return r.data; };
  const submit = async (values) => { const id = await ok(clients.secretary.rpc("submit_change", { _module: "society_settings", _action: "update", _key: "true", _values: values })); proposals.push(id); return id; };
  const decide = (id, approved, client = clients.president) => client.rpc("decide_change", { _id: id, _approve: approved, _comment: "Settings verification" });
  try {
    for (const role of ["admin", "president", "secretary", "treasurer", "resident"]) {
      const email = `settings-${crypto.randomUUID()}@example.com`, password = `X!${crypto.randomUUID()}a9`;
      const user = await ok(admin.auth.admin.createUser({ email, password, email_confirm: true }));
      ids[role] = user.user.id;
      await ok(admin.from("user_roles").insert({ user_id: user.user.id, role }));
      const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await ok(c.auth.signInWithPassword({ email, password }));
      clients[role] = c; sessions[role] = signed.session;
    }
    for (const values of [{ monthly_amount: 0 }, { due_day: 32 }, { reminder_start_day: 0 }, { reminder_timezone: "Not/AZone" }, { monthly_amount: 2000, effective_month: "2026-01-01" }]) {
      expect((await clients.president.from("society_settings").update(values).eq("id", true)).error).not.toBeNull();
    }
    await clients.secretary.from("society_settings").update({ reminder_start_day: 9 }).eq("id", true);
    expect((await admin.from("society_settings").select("reminder_start_day").eq("id", true).single()).data.reminder_start_day).toBe(original.reminder_start_day);
    for (const role of ["treasurer", "resident"]) {
      await clients[role].from("society_settings").update({ reminder_start_day: 9 }).eq("id", true);
      expect((await admin.from("society_settings").select("reminder_start_day").eq("id", true).single()).data.reminder_start_day).toBe(original.reminder_start_day);
      expect((await clients[role].rpc("submit_change", { _module: "society_settings", _action: "update", _key: "true", _values: { reminder_start_day: 9 } })).error).not.toBeNull();
    }
    const rejected = await submit({ reminder_start_day: 5 });
    expect((await decide(rejected, true, clients.secretary)).error).not.toBeNull();
    await ok(decide(rejected, false));
    expect((await admin.from("society_settings").select("reminder_start_day").eq("id", true).single()).data.reminder_start_day).toBe(original.reminder_start_day);
    const p = await submit({ reminder_time: "11:15:00" });
    expect((await admin.from("society_settings").select("reminder_time").eq("id", true).single()).data.reminder_time).toBe(original.reminder_time);
    await ok(decide(p, true));
    expect((await admin.from("society_settings").select("reminder_time").eq("id", true).single()).data.reminder_time).toBe("11:15:00");
    expect((await admin.from("maintenance_bills").select("*").order("id")).data).toEqual(billsBefore);
    expect((await decide(p, true)).error).not.toBeNull();
    expect((await clients.president.from("maintenance_bills").update({ amount: 1 }).eq("id", billsBefore[0]?.id ?? crypto.randomUUID()).select()).data ?? []).toEqual([]);
    await ok(clients.admin.from("society_settings").update({ reminder_start_day: 4, reminder_time: "10:00", reminder_timezone: "Asia/Kolkata", reminders_enabled: true, payment_notifications: false }).eq("id", true));
    for (const day of [1,2,3]) expect(await ok(admin.rpc("reminder_is_due", { _at: `2026-10-0${day}T04:30:00Z` }))).toBe(false);
    expect(await ok(admin.rpc("reminder_is_due", { _at: "2026-10-04T04:29:00Z" }))).toBe(false);
    expect(await ok(admin.rpc("reminder_is_due", { _at: "2026-10-04T04:30:00Z" }))).toBe(true);
    await ok(clients.president.from("society_settings").update({ reminder_time: "11:15" }).eq("id", true));
    expect(await ok(admin.rpc("reminder_is_due", { _at: "2026-10-04T04:30:00Z" }))).toBe(false);
    expect(await ok(admin.rpc("reminder_is_due", { _at: "2026-10-04T05:45:00Z" }))).toBe(true);
    await ok(admin.from("society_settings").update({ reminders_enabled: false }).eq("id", true));
    expect(await ok(admin.rpc("reminder_is_due", { _at: "2026-10-04T05:45:00Z" }))).toBe(false);
    const current = (await db`select date_trunc('month',now() at time zone 'Asia/Kolkata')::date::text as period`)[0].period;
    await ok(admin.from("flats").insert({ id: flat, flat_number: `settings-${flat}`, resident_name: "Settings test", mobile: "0000000000", billing_start: current }));
    await ok(admin.rpc("freeze_monthly_bills")); await ok(admin.rpc("freeze_monthly_bills"));
    expect((await admin.from("maintenance_bills").select("id").eq("flat_id",flat)).data.length).toBe(1);
    await ok(admin.from("maintenance_reminders").insert({ flat_id: flat, reminder_date: current, amount_due: 1500 }));
    expect((await admin.from("maintenance_reminders").insert({ flat_id: flat, reminder_date: current, amount_due: 1500 })).error).not.toBeNull();
    const due = (await admin.from("flat_accounts").select("outstanding").eq("id",flat).single()).data.outstanding;
    const payment = await ok(admin.from("payments").insert({ flat_id: flat, amount: due, method: "upi", status: "pending" }).select("id").single());
    expect((await admin.from("flat_accounts").select("outstanding").eq("id",flat).single()).data.outstanding).toBe(due);
    await ok(admin.from("payments").update({ status: "confirmed" }).eq("id",payment.id));
    expect((await admin.from("flat_accounts").select("outstanding").eq("id",flat).single()).data.outstanding).toBe(0);
    mkdirSync("/tmp/browser/settings", { recursive: true });
    writeFileSync("/tmp/browser/settings/state.json", JSON.stringify({ sessions, ids, original, proposals, storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token` }), { mode: 0o600 });
    const browser = Bun.spawn(["python3", "tests/settings-browser.py"], { stdout: "inherit", stderr: "inherit" });
    expect(await browser.exited).toBe(0);
  } finally {
    await ok(admin.from("society_settings").update({ reminders_enabled: original.reminders_enabled, reminder_start_day: original.reminder_start_day, reminder_time: original.reminder_time, reminder_timezone: original.reminder_timezone, payment_notifications: original.payment_notifications }).eq("id",true));
    await admin.from("payments").delete().eq("flat_id", flat);
    await admin.from("maintenance_reminders").delete().eq("flat_id", flat);
    await admin.from("maintenance_bills").delete().eq("flat_id", flat);
    await admin.from("flats").delete().eq("id",flat);
    const rows = (await admin.from("change_proposals").select("id").in("submitted_by",Object.values(ids))).data ?? [];
    for (const row of rows) { await admin.from("change_audit").delete().eq("proposal_id",row.id); await admin.from("change_proposals").delete().eq("id",row.id); }
    for (const id of Object.values(ids)) { await admin.from("user_roles").delete().eq("user_id",id); await admin.auth.admin.deleteUser(id); }
    await db.end(); try { unlinkSync("/tmp/browser/settings/state.json"); } catch {}
  }
}, 240000);
