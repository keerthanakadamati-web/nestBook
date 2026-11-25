import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";

test("Recurring expenses: permissions, generation, duplicate prevention, payment, approval and report totals", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Recurring tests require backend test configuration");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = {}, clients = {}, sessions = {}, proposalIds = [];
  const ok = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
  const originalExpenses = await ok(admin.from("expenses").select("*").order("id"));
  const scheduleIds = [], entryIds = [], expenseIds = [];
  const create = async (role) => {
    const email = `recurring-${crypto.randomUUID()}@example.com`, password = `X!${crypto.randomUUID()}a9`;
    const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error || !res.data.user) throw new Error("Test account setup failed");
    ids[role] = res.data.user.id;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await ok(client.auth.signInWithPassword({ email, password }));
    sessions[role] = signed.session;
    clients[role] = client;
    if ((await admin.from("user_roles").insert({ user_id: ids[role], role })).error) throw new Error("Test role setup failed");
  };
  try {
    for (const role of ["president", "secretary", "treasurer", "resident", "admin"]) await create(role);
    const tag = crypto.randomUUID().slice(0, 8);
    const month = "2099-03";

    // Residents and Secretary cannot read salary details; committee finance roles can.
    const seed = await admin.from("recurring_expenses").insert({ name: `Watchman salary ${tag}`, category: "Watchman / Security Guard Salary", expected_amount: 9000, due_day: 5, vendor: "Test Guard", start_date: "2099-01-01", frequency: "monthly", created_by: ids.admin }).select("id").single();
    expect(seed.error).toBeNull();
    scheduleIds.push(seed.data.id);
    expect((await clients.resident.from("recurring_expenses").select("id")).data.length).toBe(0);
    expect((await clients.secretary.from("recurring_expenses").select("id")).data.length).toBe(0);
    expect((await clients.treasurer.from("recurring_expenses").select("id").eq("id", seed.data.id)).data.length).toBe(1);

    // Only Admin/President write schedules directly; Treasurer and Secretary are blocked from live writes.
    expect((await clients.treasurer.from("recurring_expenses").insert({ name: "x", category: "x", expected_amount: 1, due_day: 1, start_date: "2099-01-01" })).error).not.toBeNull();
    await clients.secretary.from("recurring_expenses").update({ name: "x" }).eq("id", seed.data.id);
    expect((await ok(admin.from("recurring_expenses").select("name").eq("id", seed.data.id).single())).name).toContain("Watchman salary");
    expect((await clients.secretary.rpc("submit_change", { _module: "recurring_expenses", _action: "update", _key: seed.data.id, _values: { vendor: "forged" } })).error).not.toBeNull();
    expect((await clients.president.from("recurring_expenses").update({ vendor: "Test Guard Jr" }).eq("id", seed.data.id)).error).toBeNull();

    // Generation creates one entry per schedule and period, never duplicates.
    expect((await clients.resident.rpc("generate_recurring_entries", { _month: month })).error).not.toBeNull();
    expect((await clients.secretary.rpc("generate_recurring_entries", { _month: month })).error).not.toBeNull();
    const gen = await clients.treasurer.rpc("generate_recurring_entries", { _month: month });
    expect(gen.error).toBeNull();
    expect(gen.data).toBe(1);
    const genAgain = await clients.admin.rpc("generate_recurring_entries", { _month: month });
    expect(genAgain.error).toBeNull();
    expect(genAgain.data).toBe(0);
    const entry = (await admin.from("recurring_entries").select("*").eq("recurring_id", seed.data.id).eq("period", month).single()).data;
    entryIds.push(entry.id);
    expect(entry.status).toBe("planned");
    expect(Number(entry.expected_amount)).toBe(9000);
    expect((await clients.secretary.from("recurring_entries").select("id").eq("id", entry.id)).data.length).toBe(0);
    expect((await clients.resident.from("recurring_entries").select("id").eq("id", entry.id)).data.length).toBe(0);
    // Generated history is retained even after changing or pausing its live schedule.
    expect((await clients.president.from("recurring_expenses").update({ expected_amount: 10000, due_day: 12 }).eq("id", seed.data.id)).error).toBeNull();
    const frozen = await ok(admin.from("recurring_entries").select("expected_amount,schedule_snapshot").eq("id", entry.id).single());
    expect(Number(frozen.expected_amount)).toBe(9000);
    expect(Number(frozen.schedule_snapshot.expected_amount)).toBe(9000);
    expect(frozen.schedule_snapshot.due_day).toBe(5);

    // Creating an entry must not create an expense or mark anything paid.
    expect((await admin.from("expenses").select("id").eq("expense_month", month)).data.length).toBe(0);

    // Treasurer cannot record payment directly; the payment goes through President approval.
    expect((await clients.treasurer.rpc("pay_recurring_entry", { _entry: entry.id, _amount: 9500, _paid_on: "2099-03-05", _method: "cash", _reference: "r1", _notes: "extra bonus" })).error).not.toBeNull();
    const proposal = await clients.treasurer.rpc("submit_change", { _module: "recurring_entries", _action: "update", _key: entry.id, _values: { status: "paid", actual_amount: 9500, paid_on: "2099-03-05", method: "cash", payment_reference: "r1", notes: "extra bonus" } });
    expect(proposal.error).toBeNull();
    proposalIds.push(proposal.data);
    expect((await admin.from("recurring_entries").select("status").eq("id", entry.id).single()).data.status).toBe("planned");
    // Treasurer can see own pending proposal; a duplicate proposal for the same entry is blocked.
    expect((await clients.treasurer.from("change_proposals").select("id").eq("id", proposal.data)).data.length).toBe(1);
    expect((await clients.treasurer.rpc("submit_change", { _module: "recurring_entries", _action: "update", _key: entry.id, _values: { status: "paid", actual_amount: 1, paid_on: "2099-03-06", method: "cash" } })).error).not.toBeNull();
    // Treasurer cannot approve; President approval pays the entry and creates the actual expense.
    expect((await clients.treasurer.rpc("decide_change", { _id: proposal.data, _approve: true, _comment: "" })).error).not.toBeNull();
    expect((await clients.president.rpc("decide_change", { _id: proposal.data, _approve: true, _comment: "ok" })).error).toBeNull();
    const paid = (await admin.from("recurring_entries").select("*").eq("id", entry.id).single()).data;
    expect(paid.status).toBe("paid");
    expect(Number(paid.actual_amount)).toBe(9500);
    expect(paid.expense_id).not.toBeNull();
    expenseIds.push(paid.expense_id);
    const expense = (await admin.from("expenses").select("*").eq("id", paid.expense_id).single()).data;
    expect(Number(expense.amount)).toBe(9500);
    expect(expense.expense_month).toBe(month);
    expect(expense.category).toBe("Watchman / Security Guard Salary");
    expect(expense.description).toContain("Watchman salary");

    // Admin pays a second schedule directly; paying twice is rejected.
    const second = await admin.from("recurring_expenses").insert({ name: `Lift AMC ${tag}`, category: "Lift Maintenance / AMC", expected_amount: 3000, due_day: 10, start_date: "2099-03-01", frequency: "quarterly", requires_receipt: true, created_by: ids.admin }).select("id").single();
    scheduleIds.push(second.data.id);
    const gen2 = await clients.admin.rpc("generate_recurring_entries", { _month: month });
    expect(gen2.data).toBe(1);
    const entry2 = (await admin.from("recurring_entries").select("*").eq("recurring_id", second.data.id).eq("period", month).single()).data;
    entryIds.push(entry2.id);
    const missingProof = await clients.admin.rpc("pay_recurring_entry", { _entry: entry2.id, _amount: 3000, _paid_on: "2099-03-10", _method: "online", _reference: "upi-1", _notes: "" });
    expect(missingProof.error?.message).toContain("required bill or receipt");
    expect((await ok(admin.from("recurring_entries").select("status,expense_id").eq("id", entry2.id).single())).expense_id).toBeNull();
    const proofPath = `${entry2.id}/${crypto.randomUUID()}-receipt.txt`;
    const proof = new Blob(["Temporary receipt for recurring expense verification"], { type: "text/plain" });
    await ok(clients.admin.storage.from("expense-documents").upload(proofPath, proof));
    await ok(clients.admin.from("expense_attachments").insert({ entry_id: entry2.id, file_path: proofPath, file_name: "receipt.txt", file_size: proof.size }));
    for (const role of ["secretary", "resident"]) {
      expect((await ok(clients[role].from("expense_attachments").select("id").eq("entry_id", entry2.id))).length).toBe(0);
      expect((await clients[role].storage.from("expense-documents").download(proofPath)).error).not.toBeNull();
    }
    const concurrentPayments = await Promise.all([1, 2].map(() => clients.admin.rpc("pay_recurring_entry", { _entry: entry2.id, _amount: 3000, _paid_on: "2099-03-10", _method: "online", _reference: "upi-1", _notes: "" })));
    expect(concurrentPayments.filter(p => p.error === null).length).toBe(1);
    expect(concurrentPayments.filter(p => p.error !== null).length).toBe(1);
    const paid2 = (await admin.from("recurring_entries").select("expense_id").eq("id", entry2.id).single()).data;
    expenseIds.push(paid2.expense_id);
    expect((await clients.admin.rpc("pay_recurring_entry", { _entry: entry2.id, _amount: 3000, _paid_on: "2099-03-10", _method: "online", _reference: "", _notes: "" })).error).not.toBeNull();

    // Paused and ended schedules generate nothing; history is preserved.
    expect((await clients.president.from("recurring_expenses").update({ status: "paused" }).eq("id", second.data.id)).error).toBeNull();
    const gen3 = await clients.admin.rpc("generate_recurring_entries", { _month: "2099-04" });
    expect(gen3.data).toBe(1); // only the still-active monthly schedule
    expect((await admin.from("recurring_entries").select("id").eq("recurring_id", second.data.id).eq("period", "2099-04")).data.length).toBe(0);
    expect((await admin.from("expenses").select("id").eq("id", paid2.expense_id)).data.length).toBe(1);
    expect((await clients.president.from("recurring_entries").update({ actual_amount: 1 }).eq("id", entry2.id)).error).not.toBeNull();
    const annual = await ok(admin.from("recurring_expenses").insert({ name: `Annual essential ${tag}`, category: "Annual test category", expected_amount: 400, due_day: 1, start_date: "2099-02-01", frequency: "annually", created_by: ids.admin }).select("id").single());
    scheduleIds.push(annual.id);
    await ok(clients.admin.rpc("generate_recurring_entries", { _month: "2099-06" }));
    expect((await ok(admin.from("recurring_entries").select("id").eq("recurring_id", annual.id))).length).toBe(0);
    await ok(clients.admin.rpc("generate_recurring_entries", { _month: "2100-02" }));
    expect((await ok(admin.from("recurring_entries").select("id").eq("recurring_id", annual.id).eq("period", "2100-02"))).length).toBe(1);
    await ok(clients.president.from("recurring_expenses").update({ status: "ended" }).eq("id", annual.id));
    await ok(clients.admin.rpc("generate_recurring_entries", { _month: "2101-02" }));
    expect((await ok(admin.from("recurring_entries").select("id").eq("recurring_id", annual.id).eq("period", "2101-02"))).length).toBe(0);

    // Report totals count each paid recurring expense exactly once.
    const total = (await admin.from("expenses").select("amount").eq("expense_month", month)).data.reduce((t, e) => t + Number(e.amount), 0);
    expect(total).toBe(12500);
    mkdirSync('/tmp/browser/recurring', { recursive: true });
    writeFileSync('/tmp/browser/recurring/state.json', JSON.stringify({sessions, ids, name: `Browser expense ${tag}`, storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`}), {mode: 0o600});
    const browser = Bun.spawn(['python3','tests/recurring-browser.py'], {stdout:'inherit',stderr:'inherit'});
    expect(await browser.exited).toBe(0);
  } finally {
    const ownSchedules = await ok(admin.from('recurring_expenses').select('id').in('created_by',Object.values(ids)));
    const ownProposals = await ok(admin.from('change_proposals').select('id,record_key,module').in('submitted_by',Object.values(ids)));
    scheduleIds.push(...ownSchedules.map(s=>s.id), ...ownProposals.filter(p=>p.module==='recurring_expenses').map(p=>p.record_key));
    const entries = await ok(admin.from('recurring_entries').select('id,expense_id').in('recurring_id', scheduleIds));
    entryIds.push(...entries.map(e=>e.id)); expenseIds.push(...entries.map(e=>e.expense_id).filter(Boolean));
    const attachments = await ok(admin.from('expense_attachments').select('file_path').in('entry_id', entryIds));
    await ok(admin.from('expense_attachments').delete().in('entry_id',entryIds));
    if (attachments.length) await ok(admin.storage.from('expense-documents').remove(attachments.map(a=>a.file_path)));
    await ok(admin.from('recurring_entries').delete().in('id',entryIds));
    for (const id of expenseIds) await ok(admin.from('expenses').delete().eq('id',id));
    await ok(admin.from('recurring_expense_events').delete().in('schedule_id',scheduleIds));
    proposalIds.push(...ownProposals.map(p=>p.id));
    for (const id of scheduleIds) await admin.from("recurring_expenses").delete().eq("id", id);
    for (const id of proposalIds) {
      await admin.from("change_audit").delete().eq("proposal_id", id);
      await admin.from("change_proposals").delete().eq("id", id);
    }
    expect(await ok(admin.from("expenses").select("*").order("id"))).toEqual(originalExpenses);
    try { unlinkSync("/tmp/browser/recurring/state.json"); } catch {}
    for (const role of Object.keys(ids)) {
      await admin.from("user_roles").delete().eq("user_id", ids[role]);
      await admin.auth.admin.deleteUser(ids[role]);
    }
  }
}, 120000);
