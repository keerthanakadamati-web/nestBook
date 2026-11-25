import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Field, Modal, Notice, Panel, PrimaryButton, QuietButton } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { approvalModules } from "@/lib/approval-fields";
import { type ApprovalAction, type ApprovalModule, saveAdministrativeChange } from "@/lib/approval";
import { listApprovalHistory } from "@/lib/approval-list.functions";
import { approveOwnerLogin } from "@/lib/approvals.functions";
import type { Json } from "@/integrations/supabase/types";
import { RecurringEntryDocuments } from "@/components/recurring-expenses";
import { canDecideModule } from "@/lib/permissions";
import { assignRoleByEmail } from "@/lib/role-assignment.functions";

const options = queryOptions({ queryKey: ["approval-history"], queryFn: () => listApprovalHistory() });
export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [
    { title: "President approvals and history — NestInLedger" },
    { name: "description", content: "Review proposed apartment changes and their decision history." },
    { property: "og:title", content: "President approvals and history — NestInLedger" },
    { property: "og:description", content: "Secretary proposals, President decisions and change history." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(options),
  component: Approvals,
});

function Values({ value, names = {} }: { value: Json | null; names?: Record<string, string> }) {
  const show = (v: unknown) => typeof v === "string" && names[v] ? names[v] : String(v);
  if (value === null) return <p className="text-sm text-muted-foreground">No record</p>;
  if (typeof value !== "object" || Array.isArray(value)) return <p className="break-words text-sm">{JSON.stringify(value)}</p>;
  return <dl className="space-y-2 text-sm">{Object.entries(value).map(([key, v]) => <div key={key}><dt className="text-muted-foreground">{approvalModules.flatMap((m) => m.fields).find((f) => f.key === key)?.label ?? ({ flat_id: "Flat", owner_id: "Raised by", resident_user_id: "Owner" } as Record<string, string>)[key] ?? key.replaceAll("_", " ")}</dt><dd className="break-words font-medium">{v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : show(v)}</dd></div>)}</dl>;
}

function Approvals() {
  const { role, userId, societyName } = useSessionRole();
  const { data, refetch } = useSuspenseQuery(options);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const approveLogin = useServerFn(approveOwnerLogin);
  if (!data.allowed) return <main className="p-8"><Notice tone="error">Administrative access is required to view these changes.</Notice></main>;
  const shown = data.proposals.filter((p) => (status === "all" || p.status === status) && JSON.stringify([p, data.audit.filter((a) => a.proposal_id === p.id)]).toLowerCase().includes(search.toLowerCase()));
  async function decide(id: string, approve: boolean, action: string) {
    setBusy(id); setError("");
    try {
      const comment = comments[id] ?? "";
      if (approve && action === "create_login") {
        const result = await approveLogin({ data: { id, comment, password: passwords[id] ?? "" } });
        if (!result.ok) { setError(result.error); return; }
      } else {
        const result = await supabase.rpc("decide_change", { _id: id, _approve: approve, _comment: comment });
        if (result.error) { setError(result.error.message); return; }
      }
      setPasswords((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await refetch(); window.dispatchEvent(new Event("approvals-changed"));
    } catch { setError("Could not decide this proposal. Please try again."); }
    finally { setBusy(null); }
  }
  return <main className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm uppercase text-muted-foreground">{societyName ?? "Your apartment"}</p><h1 className="font-display text-3xl font-bold">{role === "president" || role === "treasurer" ? "Pending Approvals" : role === "admin" ? "Proposals / History" : "My proposed changes"}</h1></div>{role === "secretary" ? <PrimaryButton onClick={() => setComposing(true)}>Propose a change</PrimaryButton> : null}</header>
    <div className="my-6 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Search history" value={search} onChange={(e) => setSearch(e.target.value)} /></div><QuietButton onClick={() => refetch()}>Refresh</QuietButton></div>
    <div className="mb-5 flex flex-wrap gap-2">{["pending", "approved", "rejected", "all"].map((s) => <Button key={s} variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)}>{s === "all" ? "All history" : s[0]?.toUpperCase() + s.slice(1)} ({data.proposals.filter((p) => s === "all" || p.status === s).length})</Button>)}</div>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {!shown.length ? <p className="py-8 text-muted-foreground">No {status === "all" ? "recorded" : status} changes.</p> : null}
    <div className="space-y-5">{shown.map((p) => <Panel key={p.id}>
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">{approvalModules.find((m) => m.value === p.module)?.label ?? p.module} · {p.action.replaceAll("_", " ")}</h2><span className="text-sm font-semibold">{p.status}</span></div>
      <p className="mt-2 break-words text-sm text-muted-foreground">Submitted by {data.names[p.submitted_by] ?? p.submitted_email} · {new Date(p.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <p className="break-words text-xs text-muted-foreground">Record: {data.names[p.record_key] ?? p.record_key}</p>
      <div className="mt-5 grid gap-6 md:grid-cols-2"><section><h3 className="mb-3 font-semibold">Previous values</h3><Values value={p.previous_values} names={data.names} /></section><section><h3 className="mb-3 font-semibold">Proposed values</h3><Values value={p.proposed_values} names={data.names} /></section></div>
      {p.module === "recurring_entries" ? <RecurringEntryDocuments entryId={p.record_key} /> : null}
      {canDecideModule(role, p.module) && p.status === "pending" && p.submitted_by !== userId ? <div className="mt-5 space-y-3"><Field label="Comment (required when rejecting)" value={comments[p.id] ?? ""} onChange={(e) => setComments({ ...comments, [p.id]: e.target.value })} />{p.action === "create_login" ? <Field label="Temporary password (new owners only)" type="password" autoComplete="new-password" value={passwords[p.id] ?? ""} onChange={(e) => setPasswords({ ...passwords, [p.id]: e.target.value })} /> : null}<div className="flex gap-3"><PrimaryButton disabled={busy !== null} onClick={() => decide(p.id, true, p.action)}>Approve</PrimaryButton><QuietButton disabled={busy !== null} onClick={() => decide(p.id, false, p.action)}>Reject</QuietButton></div></div> : null}
      {p.reviewed_at ? <p className="mt-5 break-words text-sm">{p.status === "rejected" ? "Rejection reason" : "Reviewer comment"}: {p.review_comment || "No comment"} · {new Date(p.reviewed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · Reviewer {(p.reviewed_by && data.names[p.reviewed_by]) || p.reviewed_by}</p> : null}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Audit history</summary><ul className="mt-3 space-y-3">{data.audit.filter((a) => a.proposal_id === p.id).map((a) => <li key={a.id} className="break-words">{a.event} · {new Date(a.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {data.names[a.actor_id] ?? a.actor_id}{a.comment ? ` · ${a.comment}` : ""}{a.event === "applied" ? <Values value={a.proposed_values} names={data.names} /> : null}</li>)}</ul></details>
    </Panel>)}</div>
    {composing ? <ProposalForm onClose={() => setComposing(false)} onSaved={async () => { setComposing(false); setStatus("pending"); await refetch(); }} /> : null}
  </div></main>;
}

function ProposalForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const assignRole = useServerFn(assignRoleByEmail);
  const [module, setModule] = useState<ApprovalModule>("flats");
  const [action, setAction] = useState<ApprovalAction>("update");
  const [key, setKey] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const moduleInfo = approvalModules.find((m) => m.value === module);
  const fields = action === "create_login" ? [{ key: "email", label: "Owner email", type: "email", options: undefined }] : moduleInfo?.fields ?? [];
  const selectClass = "mt-1.5 w-full rounded-xl border border-input bg-muted px-4 py-3 text-foreground";
  return <Modal title="Propose a change" onClose={onClose}><form className="space-y-4" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    if (module === "user_roles") {
      const chosen = values['role'];
      if (chosen !== "resident" && chosen !== "secretary" && chosen !== "treasurer" && chosen !== "president") { setError("Select a role."); setBusy(false); return; }
      try { const result = await assignRole({ data: { email: key.trim(), role: chosen } }); if (!result.ok) { setError(result.error); return; } window.dispatchEvent(new Event("approvals-changed")); await onSaved(); }
      catch { setError("Could not submit this role change. Please try again."); } finally { setBusy(false); }
      return;
    }
    const proposed: Record<string, Json> = {};
    for (const f of fields) if (values[f.key] !== undefined) {
      const value = values[f.key] ?? "";
      proposed[f.key] = value === "" ? null : f.type === "number" ? Number(value) : ["published", "deleted"].includes(f.key) ? value === "true" : value;
    }
    const result = await saveAdministrativeChange({ module, action, key: module === "society_settings" ? "true" : key, values: action === "delete" ? {} : proposed }, async () => ({ error: { message: "Only Secretary proposals are supported here." } }));
    setBusy(false); if (result.error) { setError(result.error.message); return; } await onSaved();
  }}>
    <label className="block text-sm font-medium">Section<select className={selectClass} value={module} onChange={(e) => { const m = e.target.value as ApprovalModule; setModule(m); setAction(m === "user_roles" ? "set_role" : "update"); setValues({}); setKey(""); }}>{approvalModules.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
    {module !== "user_roles" ? <label className="block text-sm font-medium">Change<select className={selectClass} value={action} onChange={(e) => { setAction(e.target.value as ApprovalAction); setValues({}); }}>{["create", "update", "delete", ...(module === "flats" ? ["create_login"] : [])].map((a) => <option key={a} value={a}>{a.replaceAll("_", " ")}</option>)}</select></label> : null}
    {(action !== "create" || module === "fund_years") && module !== "society_settings" ? <Field label={module === "fund_years" ? "Financial year starting year" : module === "user_roles" ? "Email Address" : "Record ID"} type={module === "user_roles" ? "email" : "text"} value={key} required onChange={(e) => setKey(e.target.value)} /> : null}
    {action !== "delete" ? fields.map((f) => <div key={f.key}>{f.options ? <label className="block text-sm font-medium">{f.label}<select className={selectClass} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}><option value="">Unchanged</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label> : <Field label={f.label} type={f.type ?? "text"} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}</div>) : null}
    {error ? <Notice tone="error">{error}</Notice> : null}<PrimaryButton type="submit" className="w-full" disabled={busy}>{busy ? "Submitting…" : "Submit for President approval"}</PrimaryButton>
  </form></Modal>;
}