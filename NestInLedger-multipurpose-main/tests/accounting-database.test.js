import { expect, test } from "bun:test";
import postgres from "postgres";
import { maintenanceStatement } from "../src/lib/maintenance";
import { societyDate } from "../src/lib/accounting-date";

// Every write below is enclosed in an intentionally rolled-back transaction.
// No live financial fixtures, users, emails, report snapshots or receipts are created.
test("database boundaries and all real ledgers reconcile without committed financial changes", async () => {
  if (!process.env.SUPABASE_DB_URL) throw new Error("Rollback-only database test connection is required");
  const db = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1 });
  const aborted = new Error("Intentional rollback after verification");
  let completed = false;
  try {
    await db.begin(async (tx) => {
      const flats = await tx`select id,flat_number,billing_start,resident_user_id from public.flats order by flat_number`;
      const payments = await tx`select * from public.payments`;
      const bills = await tx`select flat_id,bill_month::text,amount,due_date::text from public.maintenance_bills`;
      const rates = await tx`select effective_month::text,monthly_amount,due_day,fy_start_month from public.maintenance_rates`;
      expect(flats.length).toBe(15);
      expect((await tx`select used from public.flat_capacity`)[0].used).toBe(15);
      expect((await tx`select sum(amount)::numeric as total from public.maintenance_bills where bill_month='2026-11-01'`)[0].total).toBe("22500");
      const roles = await tx`select user_id,role from public.user_roles where role in ('admin','president','secretary')`;
      const admin = roles.find(r=>r.role==='admin')?.user_id;
      const secretary = roles.find(r=>r.role==='secretary')?.user_id;
      const president = roles.find(r=>r.role==='president')?.user_id;
      if (!admin || !secretary || !president) throw new Error("Existing committee test identity is unavailable");
      const identity = async (uid) => { await tx`select set_config('request.jwt.claim.sub',${uid},true),set_config('request.jwt.claims',${JSON.stringify({sub:uid,role:'authenticated'})},true)`; };
      await identity(admin);
      const fails = async (work, pattern) => {
        let failure;
        try { await tx.savepoint(async (sp)=>work(sp)); } catch(e) { failure=e; }
        expect(failure?.message).toMatch(pattern);
      };
      await fails(sp=>sp`insert into public.flats(flat_number,resident_name,mobile) values ('sixteenth','Validation','0')`,/15 authorized flats/);
      await fails(sp=>sp`update public.flats set flat_number=${' '+flats[0].flat_number+' '} where id=${flats[1].id}`,/flats_canonical_number/);
      await fails(sp=>sp`update public.flats set flat_number=' ' where id=${flats[0].id}`,/flat_number_nonblank/);
      // Never consume a real receipt sequence or emit payment mail: only exercise proposal requests.
      await identity(secretary);
      const vals = {flat_id:flats[0].id,amount:13,method:'cash',status:'confirmed',paid_on:societyDate(),month_covered:'Rollback-only validation',notes:'No committed transaction'};
      const request=crypto.randomUUID();
      const first=(await tx`select public.submit_payment(${request}::uuid,${JSON.stringify(vals)}::jsonb,false) as result`)[0].result;
      const retry=(await tx`select public.submit_payment(${request}::uuid,${JSON.stringify(vals)}::jsonb,false) as result`)[0].result;
      expect(first.pending).toBe(true); expect(retry.replayed).toBe(true); expect(first.payment_id).toBe(retry.payment_id); expect(first.proposal_id).toBe(retry.proposal_id);
      expect((await tx`select count(*)::int as n from public.payments where id=${first.payment_id}`)[0].n).toBe(0);
      await fails(sp=>sp`select public.submit_payment(${request}::uuid,${JSON.stringify({...vals,amount:14})}::jsonb,false)`,/different payment details/);
      await fails(sp=>sp`select public.submit_payment(${crypto.randomUUID()}::uuid,${JSON.stringify(vals)}::jsonb,false)`,/matching cash payment/);
      const separate=(await tx`select public.submit_payment(${crypto.randomUUID()}::uuid,${JSON.stringify({...vals,notes:'A separate legitimate cash transfer'})}::jsonb,true) as result`)[0].result;
      expect(separate.payment_id).not.toBe(first.payment_id);
      const reference='rollback-'+crypto.randomUUID();
      const upi={...vals,method:'upi',status:'pending',reference};
      const u=(await tx`select public.submit_payment(${crypto.randomUUID()}::uuid,${JSON.stringify(upi)}::jsonb,false) as result`)[0].result;
      expect(u.pending).toBe(true);
      await fails(sp=>sp`select public.submit_payment(${crypto.randomUUID()}::uuid,${JSON.stringify({...upi,reference:reference.toUpperCase()})}::jsonb,false)`,/already been submitted/);
      await fails(sp=>sp`select public.submit_payment(${crypto.randomUUID()}::uuid,${JSON.stringify({...upi,reference:''})}::jsonb,false)`,/bank transaction reference/);
      await fails(sp=>sp`select public.decide_change(${first.proposal_id}::uuid,true,'',null)`,/Only the President/);
      await identity(president);
      // Rejection is rolled back too; verifies decisions keep their existing authority.
      await tx`select public.decide_change(${first.proposal_id}::uuid,false,'Rollback-only validation',null)`;
      await fails(sp=>sp`select public.decide_change(${first.proposal_id}::uuid,false,'again',null)`,/already been decided/);
      await identity(admin);
      const nativeFlats=flats.map(f=>({...f,billing_start:typeof f.billing_start==='string'?f.billing_start.slice(0,10):f.billing_start.toISOString().slice(0,10)}));
      const nativePayments=payments.map(p=>({...p,amount:Number(p.amount),paid_on:typeof p.paid_on==='string'?p.paid_on.slice(0,10):p.paid_on.toISOString().slice(0,10)}));
      for (const month of ['2026-09','2026-10','2026-11']) {
        for (const f of nativeFlats) {
          const js=maintenanceStatement(f,nativePayments,month,rates,bills);
          const sql=(await tx`select * from public.flat_bill_position(${f.id}::uuid,${month+'-01'}::date)`)[0];
          expect(Number(sql.charged)-Number(sql.paid)).toBe(js.outstanding-js.credit);
          expect(Number(sql.current_due)).toBe(js.currentOutstanding); expect(Number(sql.previous_due)).toBe(js.previous); expect(sql.account_status).toBe(js.status);
        }
        const end=month==='2026-09'?'2026-10-01':month==='2026-10'?'2026-11-01':'2026-12-01';
        const s=(await tx`select public.financial_report_snapshot(${month+'-01'}::date,${end}::date) as snapshot`)[0].snapshot;
        expect(Number(s.openingOutstanding)-Number(s.openingAdvanceCredit)+Number(s.maintenanceBilled)-Number(s.maintenanceCollected)).toBe(Number(s.outstandingDues)-Number(s.closingAdvanceCredit));
        expect(Number(s.closingBalance)).toBe(Number(s.openingBalance)+Number(s.totalIncome)-Number(s.totalExpenses));
        expect(s.transactions.filter(t=>t.kind==='Maintenance').reduce((sum,t)=>sum+Number(t.amount),0)).toBe(Number(s.maintenanceCollected));
        expect(s.transactions.filter(t=>t.kind==='Expense').reduce((sum,t)=>sum+Number(t.amount),0)).toBe(Number(s.totalExpenses));
      }
      const otherOwner=nativeFlats.find(f=>f.resident_user_id && f.resident_user_id!==nativeFlats[0].resident_user_id);
      if (otherOwner?.resident_user_id && nativeFlats[0].resident_user_id) {
        await identity(nativeFlats[0].resident_user_id);
        await fails(sp=>sp`select * from public.flat_bill_position(${otherOwner.id}::uuid,'2026-11-01')`,/Flat access required/);
      }
      completed=true;
      throw aborted;
    });
  } catch(e) { if (e!==aborted) throw e; }
  finally { await db.end(); }
  expect(completed).toBe(true);
},120000);