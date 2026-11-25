import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { complaintStatuses, complaintInput, isOverdue, complaintMatches } from "../src/lib/complaint-rules";

test("complaint progress stays distinct from approval and overdue excludes resolved issues", () => {
  expect(complaintStatuses).toEqual(["Submitted", "Under Review", "Assigned", "In Progress", "Awaiting Approval", "Resolved", "Reopened"]);
  expect(isOverdue({ due_on: "2026-10-25", status: "In Progress" }, "2026-10-26")).toBe(true);
  expect(isOverdue({ due_on: "2026-10-25", status: "Resolved" }, "2026-10-26")).toBe(false);
  expect(isOverdue({ due_on: null, status: "Submitted" }, "2026-10-26")).toBe(false);
});
test("submission requires an actual flat and meaningful complaint", () => {
  expect(complaintInput.safeParse({ flatId: "not-a-flat", title: "", description: "", category: "Other", requestId: crypto.randomUUID() }).success).toBe(false);
});
test("complaint filters compare actual status category flat date and priority", () => {
  const c = { status: "Submitted", category: "Water", priority: "Urgent", flat_id: "flat1", submitted_at: "2026-10-26T10:00:00Z" };
  expect(complaintMatches(c, { status: "Submitted", category: "Water", priority: "Urgent", flat: "flat1", date: "2026-10-26" })).toBe(true);
  expect(complaintMatches(c, { status: "Resolved", category: "", priority: "", flat: "", date: "" })).toBe(false);
});

test("private complaints, photos, approvals, conflicts, notifications and finances", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Complaint test access required");
  // Do not generate emails during fixtures: the new hook must not be published yet.
  const live = await fetch("https://labanyaenlave.lovable.app/api/public/hooks/complaint-email", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  if (live.status !== 404) throw new Error("Run fixture tests only before complaint email publishing to avoid real notifications");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const clients = {}, ids = {}, sessions = {}, flatIds = [], complaintIds = [], proposalIds = [];
  const ok = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
  const snapshot = async () => Promise.all(["payments", "expenses"].map((t) => ok(admin.from(t).select("*").order("id"))));
  const finances = await snapshot();
  let photoPath;
  try {
    for (const role of ["resident", "other", "secretary", "president", "treasurer", "admin"]) {
      const email = `complaint-${crypto.randomUUID()}@example.com`, password = `X!${crypto.randomUUID()}a9`;
      const user = await ok(admin.auth.admin.createUser({ email, password, email_confirm: true })); ids[role] = user.user.id;
      await ok(admin.from("user_roles").insert({ user_id: ids[role], role: role === "other" ? "resident" : role }));
      const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      sessions[role] = (await ok(c.auth.signInWithPassword({ email, password }))).session; clients[role] = c;
    }
    for (const role of ["resident", "other"]) {
      const id = crypto.randomUUID(); flatIds.push(id);
      await ok(admin.from("flats").insert({ id, flat_number: `Complaint-${id.slice(0,8)}`, resident_name: "Complaint verification", mobile: "0000000000", resident_user_id: ids[role], billing_start: "2099-01-01" }));
    }
    const request = crypto.randomUUID();
    const submit = (c, flat, r=request) => c.rpc("submit_complaint", { _flat: flat, _title: "Water leak verification", _description: "Pipe requires inspection", _category: "Water", _request: r });
    expect((await submit(clients.resident, flatIds[1])).error).not.toBeNull();
    expect((await submit(clients.treasurer, flatIds[0])).error).not.toBeNull();
    const id = await ok(submit(clients.resident, flatIds[0])); complaintIds.push(id);
    expect(await ok(submit(clients.resident, flatIds[0]))).toBe(id);
    expect((await ok(clients.other.from("complaints").select("id").eq("id", id))).length).toBe(0);
    expect((await ok(clients.treasurer.from("complaints").select("id"))).length).toBe(0);
    expect((await ok(clients.secretary.from("complaints").select("id").eq("id", id))).length).toBe(1);
    await clients.secretary.from("complaints").update({ status: "Resolved" }).eq("id", id);
    expect((await ok(admin.from("complaints").select("status").eq("id", id).single())).status).toBe("Submitted");
    const propose = async (values) => { const p = await ok(clients.secretary.rpc("submit_change", { _module: "complaints", _action: "update", _key: id, _values: values })); proposalIds.push(p); return p; };
    const decide = (p, approve, c=clients.president) => c.rpc("decide_change", { _id: p, _approve: approve, _comment: "Complaint verification decision" });
    expect((await clients.secretary.rpc("submit_change", { _module: "complaints", _action: "update", _key: id, _values: { owner_id: ids.other } })).error).not.toBeNull();
    const p = await propose({ status: "In Progress", assigned_to: "Plumber", progress_update: "Inspection scheduled" });
    expect((await ok(admin.from("complaints").select("status").eq("id", id).single())).status).toBe("Submitted");
    expect((await decide(p, true, clients.secretary)).error).not.toBeNull();
    expect((await decide(p, true, clients.admin)).error).not.toBeNull();
    await ok(decide(p, true));
    expect((await ok(admin.from("complaints").select("status").eq("id", id).single())).status).toBe("In Progress");
    expect((await decide(p, true)).error).not.toBeNull();
    const rejected = await propose({ priority: "Urgent" }); await ok(decide(rejected, false));
    expect((await ok(admin.from("complaints").select("priority").eq("id", id).single())).priority).toBe("Normal");
    const conflict = await propose({ priority: "High" }); await ok(clients.president.from("complaints").update({ assigned_to: "Supervisor" }).eq("id", id));
    expect((await decide(conflict, true)).error).not.toBeNull(); await ok(decide(conflict, false));
    const self = await propose({ priority: "High" }); await ok(admin.from("user_roles").insert({ user_id: ids.secretary, role: "president" }));
    expect((await decide(self, true, clients.secretary)).error).not.toBeNull(); await ok(admin.from("user_roles").delete().eq("user_id", ids.secretary).eq("role", "president")); await ok(decide(self,false));
    expect((await clients.president.from("complaints").update({ status: "Resolved" }).eq("id",id)).error).not.toBeNull();
    await ok(clients.president.from("complaints").update({ status: "Resolved", resolution_details: "Pipe repaired" }).eq("id",id));
    const commentRequest=crypto.randomUUID(); const args={ _id:id, _comment:"Leak remains", _reopen:true, _request:commentRequest };
    expect((await clients.other.rpc("comment_on_complaint",args)).error).not.toBeNull();
    const comment=await ok(clients.resident.rpc("comment_on_complaint",args)); expect(await ok(clients.resident.rpc("comment_on_complaint",args))).toBe(comment);
    expect((await ok(admin.from("complaints").select("reopen_requested").eq("id",id).single())).reopen_requested).toBe(true);
    const reopen=await propose({ status:"Reopened" }); await ok(decide(reopen,true));
    expect((await ok(admin.from("complaints").select("status").eq("id",id).single())).status).toBe("Reopened");
    const event=await ok(clients.resident.from("complaint_events").select("*").eq("complaint_id",id));
    expect(event.some((e)=>e.event==='committee update')).toBe(true);
    expect(event.some((e)=>e.proposal_id!==null)).toBe(false);
    expect((await clients.resident.from("complaint_events").insert({complaint_id:id,actor_id:ids.resident,event:"fake"})).error).not.toBeNull();
    const alerts=await ok(admin.from("complaint_notifications").select("event_id,recipient_id"));
    expect(new Set(alerts.map((n)=>n.event_id+":"+n.recipient_id)).size).toBe(alerts.length);
    expect((await ok(clients.treasurer.from("complaint_notifications").select("id"))).length).toBe(0);
    photoPath=`${id}/${ids.resident}/verification.png`;
    const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=","base64");
    await ok(clients.resident.storage.from("complaint-photos").upload(photoPath,bytes,{contentType:"image/png"}));
    expect((await clients.other.storage.from("complaint-photos").createSignedUrl(photoPath,60)).error).not.toBeNull();
    expect((await clients.treasurer.storage.from("complaint-photos").createSignedUrl(photoPath,60)).error).not.toBeNull();
    expect((await clients.president.storage.from("complaint-photos").createSignedUrl(photoPath,60)).error).toBeNull();
    mkdirSync('/tmp/browser/complaints',{recursive:true});
    writeFileSync('/tmp/browser/complaints/state.json',JSON.stringify({sessions,ids,flatIds,id,storageKey:`sb-${new URL(url).hostname.split('.')[0]}-auth-token`}),{mode:0o600});
    const browser=Bun.spawn(['python3','tests/complaints-browser.py'],{stdout:'inherit',stderr:'inherit'}); expect(await browser.exited).toBe(0);
    expect(await snapshot()).toEqual(finances);
  } finally {
    if(photoPath) await admin.storage.from('complaint-photos').remove([photoPath]);
    const fixtures=await admin.from('complaints').select('id').in('owner_id',Object.values(ids)); complaintIds.push(...(fixtures.data??[]).map((c)=>c.id));
    for(const id of new Set(complaintIds)) {
      const events=await admin.from('complaint_events').select('id').eq('complaint_id',id);
      if(events.data?.length) await ok(admin.from('complaint_notifications').delete().in('event_id',events.data.map((e)=>e.id)));
      await ok(admin.from('complaint_events').delete().eq('complaint_id',id));
      const ps=await admin.from('change_proposals').select('id').eq('module','complaints').eq('record_key',id);
      for(const p of ps.data??[]){await ok(admin.from('change_audit').delete().eq('proposal_id',p.id)); await ok(admin.from('change_proposals').delete().eq('id',p.id));}
      await ok(admin.from('complaints').delete().eq('id',id));
    }
    for(const id of flatIds) await ok(admin.from('flats').delete().eq('id',id));
    for(const id of Object.values(ids)){await ok(admin.from('user_roles').delete().eq('user_id',id)); await ok(admin.auth.admin.deleteUser(id));}
    try{unlinkSync('/tmp/browser/complaints/state.json');}catch{}
  }
},240000);