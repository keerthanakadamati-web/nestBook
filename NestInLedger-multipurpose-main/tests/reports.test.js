import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { reportCsv, csvCell } from "../src/lib/report-downloads";

test("spreadsheet escapes formula-like transaction references", () => {
  expect(csvCell("=SUM(A1:A2)")).toBe('"\'=SUM(A1:A2)"');
  expect(csvCell('a"b')).toBe('"a""b"');
});

test("actual-record monthly/yearly totals, report states and isolated-role downloads", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Report verification requires the test connection");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [], reportIds = [], clients = {}, sessions = {};
  const runId = crypto.randomUUID();
  try {
    for (const role of ["treasurer", "president", "secretary", "resident"]) {
      const email = `report-${role}-${runId}@example.com`, password = `R!${crypto.randomUUID()}q9`;
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error || !made.data.user) throw new Error("Isolated report account creation failed");
      users.push(made.data.user.id);
      expect((await admin.from("user_roles").insert({ user_id: made.data.user.id, role })).error).toBeNull();
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session) throw new Error("Isolated report sign-in failed");
      clients[role] = client; sessions[role] = login.data.session;
    }
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    const monthlyStart = `${y}-${String(m).padStart(2,"0")}-01`;
    const fy = m >= 4 ? y : y - 1;
    const monthlyEnd = m === 12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,"0")}-01`;
    const paymentsResult = await admin.from("payments").select("*").eq("status", "confirmed");
    const expensesResult = await admin.from("expenses").select("*");
    const flatsResult = await admin.from("flats").select("id,billing_start");
    expect(paymentsResult.error).toBeNull(); expect(expensesResult.error).toBeNull(); expect(flatsResult.error).toBeNull();
    const payments = paymentsResult.data ?? [], expenses = expensesResult.data ?? [], flats = flatsResult.data ?? [];
    const monthIndex = (date) => Number(date.slice(0,4))*12+Number(date.slice(5,7));
    for (const [type,start,end] of [["monthly",monthlyStart,monthlyEnd],["yearly",`${fy-1}-04-01`,`${fy}-04-01`],["yearly",`${fy}-04-01`,monthlyEnd]]) {
      const created = await clients.treasurer.rpc("prepare_financial_report", { _type:type,_start:start });
      expect(created.error).toBeNull(); expect(typeof created.data).toBe("string");
      reportIds.push(created.data);
      const row = (await clients.treasurer.from("financial_reports").select("*").eq("id",created.data).single()).data;
      expect(row.status).toBe("prepared"); expect(row.period_end).toBe(end);
      const s = row.snapshot;
      const p = payments.filter((r) => r.paid_on>=start && r.paid_on<end && r.paid_on<=s.asOf);
      const e = expenses.filter((r) => (r.expense_month ?? r.expense_date.slice(0,7))>=start.slice(0,7) && (r.expense_month ?? r.expense_date.slice(0,7))<end.slice(0,7));
      const sum = (rows) => rows.reduce((n,r)=>n+Number(r.amount),0);
      expect(s.maintenanceCollected).toBeCloseTo(sum(p),6); expect(s.totalIncome).toBeCloseTo(sum(p),6);
      expect(s.totalExpenses).toBeCloseTo(sum(e),6); expect(s.transactions.length).toBe(p.length+e.length);
      expect(s.otherReceipts).toBe(0);
      const billed = flats.reduce((n,f)=>n+Math.max(monthIndex(end)-Math.max(monthIndex(f.billing_start),monthIndex(start)),0)*1500,0);
      expect(s.maintenanceBilled).toBe(billed);
      const dues = (cutoff) => flats.reduce((n,f)=>n+Math.max(Math.max(monthIndex(cutoff)-monthIndex(f.billing_start),0)*1500-sum(payments.filter((r)=>r.flat_id===f.id && r.paid_on<cutoff && r.paid_on<=s.asOf)),0),0);
      expect(s.openingOutstanding).toBeCloseTo(dues(start),6); expect(s.outstandingDues).toBeCloseTo(dues(end),6);
      const fyStart = Number(start.slice(0,4))-(Number(start.slice(5,7))<4?1:0), fyDate=`${fyStart}-04-01`;
      const fund = await admin.from("fund_years").select("opening_balance").eq("fy_start",fyStart).maybeSingle();
      const opening=Number(fund.data?.opening_balance??0)+sum(payments.filter((r)=>r.paid_on>=fyDate && r.paid_on<start))-sum(expenses.filter((r)=>(r.expense_month??r.expense_date.slice(0,7))>=fyDate.slice(0,7) && (r.expense_month??r.expense_date.slice(0,7))<start.slice(0,7)));
      expect(s.openingBalance).toBeCloseTo(opening,6); expect(s.closingBalance).toBeCloseTo(opening+sum(p)-sum(e),6);
      expect(s.expenseCategories.reduce((n,r)=>n+Number(r.amount),0)).toBeCloseTo(sum(e),6);
      expect(reportCsv(row)).toContain(String(s.maintenanceCollected));
      for (const role of ["president","secretary","resident"]) expect((await clients[role].from("financial_reports").select("id").eq("id",row.id)).data).toEqual([]);
      await clients.treasurer.from("financial_reports").update({ status:"approved" }).eq("id",row.id);
      expect((await clients.treasurer.from("financial_reports").select("status").eq("id",row.id).single()).data.status).toBe("prepared");
      expect((await clients.treasurer.rpc("transition_financial_report",{ _id:row.id,_action:"approve" })).error).not.toBeNull();
      expect((await clients.secretary.rpc("transition_financial_report",{ _id:row.id,_action:"submit" })).error).not.toBeNull();
      // Leave monthly prepared for the browser to submit; yearly submitted through the actual RPC.
      if (type==="yearly") {
        expect((await clients.treasurer.rpc("transition_financial_report",{ _id:row.id,_action:"submit" })).error).toBeNull();
        expect((await clients.treasurer.rpc("transition_financial_report",{ _id:row.id,_action:"submit" })).error).not.toBeNull();
        for (const role of ["president","secretary"]) expect((await clients[role].from("financial_reports").select("id").eq("id",row.id)).data.length).toBe(1);
        expect((await clients.secretary.rpc("transition_financial_report",{ _id:row.id,_action:"review" })).error).toBeNull();
        expect((await clients.secretary.rpc("transition_financial_report",{ _id:row.id,_action:"approve" })).error).not.toBeNull();
        expect((await clients.president.rpc("transition_financial_report",{ _id:row.id,_action:"approve" })).error).not.toBeNull();
        expect((await clients.president.rpc("transition_financial_report",{ _id:row.id,_action:"review" })).error).toBeNull();
        expect((await clients.president.rpc("transition_financial_report",{ _id:row.id,_action:"approve" })).error).toBeNull();
        expect((await clients.president.rpc("transition_financial_report",{ _id:row.id,_action:"approve" })).error).not.toBeNull();
      }
    }
    expect((await clients.resident.rpc("financial_report_snapshot",{ _start:monthlyStart,_end:monthlyEnd })).error).not.toBeNull();
    expect((await clients.secretary.rpc("prepare_financial_report",{ _type:"monthly",_start:monthlyStart })).error).not.toBeNull();
    const path = `/tmp/browser/report-sessions-${runId}.json`;
    await Bun.write(path,JSON.stringify({ sessions, reportIds, storageKey:`sb-${new URL(process.env.SUPABASE_URL).hostname.split('.')[0]}-auth-token` }));
    const browserScript = "/tmp/browser/reports/check_report_downloads.py";
    await Bun.write(browserScript, await Bun.file("tests/report-browser.py").text());
    const browser = Bun.spawn(["python3",browserScript,path],{ stdout:"inherit",stderr:"inherit" });
    expect(await browser.exited).toBe(0);
    if (await Bun.file(path).exists()) await Bun.file(path).delete();
    const result = await clients.treasurer.from("financial_reports").select("status").eq("id",reportIds[0]).single();
    expect(result.data.status).toBe("approved");
  } finally {
    for (const id of reportIds) expect((await admin.from("financial_reports").delete().eq("id",id)).error).toBeNull();
    for (const id of users) { await admin.from("user_roles").delete().eq("user_id",id); expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
  }
},180000);