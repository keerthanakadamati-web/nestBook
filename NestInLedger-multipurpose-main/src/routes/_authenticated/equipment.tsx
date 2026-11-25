import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Phone } from "lucide-react";

import { Field, Modal, Notice, Panel, PrimaryButton, QuietButton } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { canSubmitChanges } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/equipment")({
  head: () => ({
    meta: [
      { title: "Equipment & AMC Logbook — NestInLedger" },
      { name: "description", content: "Lift, pumps, generator and safety equipment service records." },
      { property: "og:title", content: "Equipment & AMC Logbook — NestInLedger" },
      { property: "og:description", content: "Lift, pumps, generator and safety equipment service records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Equipment,
});

type Item = { id: string; name: string; category: string; vendor_name: string | null; vendor_phone: string | null; amc_start: string | null; amc_end: string | null; amc_cost: number | null; last_service: string | null; next_service: string | null; notes: string | null };
type Log = { id: string; equipment_id: string; service_date: string; technician: string | null; work_done: string; next_service: string | null };
const CATS: Record<string, string> = { lift: "Lift", water: "Water", power: "Power backup", security: "Security", fire: "Fire safety", other: "Other" };
const blank = { name: "", category: "other", vendor_name: "", vendor_phone: "", amc_start: "", amc_end: "", amc_cost: "", last_service: "", next_service: "", notes: "" };
type Form = typeof blank & { id?: string };

const today = () => new Date(new Date().toDateString());
const daysTo = (d: string | null) => d ? Math.round((new Date(d).getTime() - today().getTime()) / 86400000) : null;
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Tag({ days, label }: { days: number | null; label: string }) {
  if (days === null) return <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{label}: not set</span>;
  const cls = days < 0 ? "bg-destructive/10 text-destructive" : days <= 15 ? "bg-accent text-accent-foreground" : "bg-sage text-sage-deep";
  const txt = days < 0 ? `${label}: overdue ${-days} days` : days === 0 ? `${label}: today` : days <= 15 ? `${label}: in ${days} days` : `${label}: OK`;
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${cls}`}>{txt}</span>;
}

function Equipment() {
  const { role, loading } = useSessionRole();
  const canEdit = canSubmitChanges(role);
  const [items, setItems] = useState<Item[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<Form | null>(null);
  const [logFor, setLogFor] = useState<Item | null>(null);
  const [logForm, setLogForm] = useState({ service_date: "", technician: "", work_done: "", next_service: "" });
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("society_equipment").select("*").order("name"),
      supabase.from("equipment_service_logs").select("*").order("service_date", { ascending: false }),
    ]);
    if (a.error || b.error) setMsg((a.error ?? b.error)!.message);
    else { setItems(a.data as Item[]); setLogs(b.data as Log[]); }
  }, []);
  useEffect(() => { if (!loading) refresh(); }, [loading, refresh]);

  async function save() {
    if (!editing) return;
    const n = (s: string) => s.trim() || null;
    const row = { name: editing.name.trim(), category: editing.category, vendor_name: n(editing.vendor_name), vendor_phone: n(editing.vendor_phone), amc_start: n(editing.amc_start), amc_end: n(editing.amc_end), amc_cost: editing.amc_cost ? Number(editing.amc_cost) : null, last_service: n(editing.last_service), next_service: n(editing.next_service), notes: n(editing.notes) };
    if (!row.name) { setMsg("Please enter the equipment name."); return; }
    const { error } = editing.id
      ? await supabase.from("society_equipment").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editing.id)
      : await supabase.from("society_equipment").insert(row);
    if (error) { setMsg(error.message); return; }
    setEditing(null); setMsg("Saved."); refresh();
  }

  async function saveLog() {
    if (!logFor) return;
    if (!logForm.work_done.trim()) { setMsg("Please write what work was done."); return; }
    const date = logForm.service_date || new Date().toISOString().slice(0, 10);
    const next = logForm.next_service || null;
    const { error } = await supabase.from("equipment_service_logs").insert({ equipment_id: logFor.id, service_date: date, technician: logForm.technician.trim() || null, work_done: logForm.work_done.trim(), next_service: next });
    if (error) { setMsg(error.message); return; }
    await supabase.from("society_equipment").update({ last_service: date, next_service: next ?? logFor.next_service, updated_at: new Date().toISOString() }).eq("id", logFor.id);
    setLogFor(null); setMsg("Saved."); refresh();
  }

  async function remove(i: Item) {
    if (!confirm(`Remove ${i.name} and its service history?`)) return;
    const { error } = await supabase.from("society_equipment").delete().eq("id", i.id);
    setMsg(error ? error.message : "Removed."); refresh();
  }

  const alerts = items.filter((i) => { const a = daysTo(i.amc_end), s = daysTo(i.next_service); return (a !== null && a <= 15) || (s !== null && s <= 15); });

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Equipment & AMC Logbook</h1>
          <p className="text-muted-foreground">Service dates and contracts for building machines.</p>
        </div>
        {canEdit && <PrimaryButton onClick={() => setEditing({ ...blank })}>Add equipment</PrimaryButton>}
      </div>
      <Notice tone={msg === "Saved." || msg === "Removed." ? "ok" : "error"}>{msg}</Notice>
      {alerts.length > 0 && (
        <Panel className="border-l-4 border-destructive">
          <p className="font-semibold">Needs attention ({alerts.length})</p>
          <p className="text-sm text-muted-foreground">{alerts.map((a) => a.name).join(", ")} — service or contract is due within 15 days or overdue.</p>
        </Panel>
      )}
      {items.length === 0 ? <Panel><p className="text-muted-foreground">No equipment added yet.</p></Panel> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((i) => {
            const history = logs.filter((l) => l.equipment_id === i.id);
            return (
              <Panel key={i.id} className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{CATS[i.category] ?? "Other"}</p>
                  <h2 className="text-lg font-semibold">{i.name}</h2>
                </div>
                <div className="flex flex-wrap gap-2"><Tag days={daysTo(i.next_service)} label="Service" /><Tag days={daysTo(i.amc_end)} label="AMC" /></div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Last service</dt><dd>{fmt(i.last_service)}</dd>
                  <dt className="text-muted-foreground">Next service</dt><dd>{fmt(i.next_service)}</dd>
                  <dt className="text-muted-foreground">AMC ends</dt><dd>{fmt(i.amc_end)}</dd>
                  {i.amc_cost != null && <><dt className="text-muted-foreground">AMC cost / year</dt><dd>₹{Number(i.amc_cost).toLocaleString("en-IN")}</dd></>}
                  {i.vendor_name && <><dt className="text-muted-foreground">Vendor</dt><dd>{i.vendor_name}</dd></>}
                </dl>
                {i.notes && <p className="text-sm text-muted-foreground">{i.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {i.vendor_phone && <a href={`tel:${i.vendor_phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Phone className="size-4" />Call vendor</a>}
                  {canEdit && <PrimaryButton onClick={() => { setLogFor(i); setLogForm({ service_date: new Date().toISOString().slice(0, 10), technician: "", work_done: "", next_service: "" }); }}>Log service</PrimaryButton>}
                  <QuietButton onClick={() => setOpen(open === i.id ? null : i.id)}>History ({history.length})</QuietButton>
                  {canEdit && <QuietButton onClick={() => setEditing({ id: i.id, name: i.name, category: i.category, vendor_name: i.vendor_name ?? "", vendor_phone: i.vendor_phone ?? "", amc_start: i.amc_start ?? "", amc_end: i.amc_end ?? "", amc_cost: i.amc_cost?.toString() ?? "", last_service: i.last_service ?? "", next_service: i.next_service ?? "", notes: i.notes ?? "" })}>Edit</QuietButton>}
                  {canEdit && <QuietButton onClick={() => remove(i)}>Remove</QuietButton>}
                </div>
                {open === i.id && (
                  <ul className="space-y-2 border-t pt-3 text-sm">
                    {history.length === 0 ? <li className="text-muted-foreground">No service visits logged yet.</li> : history.map((l) => (
                      <li key={l.id}><span className="font-semibold">{fmt(l.service_date)}</span> — {l.work_done}{l.technician ? ` (${l.technician})` : ""}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? "Edit equipment" : "Add equipment"} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label className="block"><span className="text-sm font-medium text-muted-foreground">Type</span>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1.5 w-full rounded-lg bg-card px-3 py-2.5 ring-1 ring-input">
                {Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <Field label="Vendor / AMC company (optional)" value={editing.vendor_name} onChange={(e) => setEditing({ ...editing, vendor_name: e.target.value })} />
            <Field label="Vendor phone (optional)" inputMode="tel" value={editing.vendor_phone} onChange={(e) => setEditing({ ...editing, vendor_phone: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="AMC start" type="date" value={editing.amc_start} onChange={(e) => setEditing({ ...editing, amc_start: e.target.value })} />
              <Field label="AMC end" type="date" value={editing.amc_end} onChange={(e) => setEditing({ ...editing, amc_end: e.target.value })} />
              <Field label="Last service" type="date" value={editing.last_service} onChange={(e) => setEditing({ ...editing, last_service: e.target.value })} />
              <Field label="Next service" type="date" value={editing.next_service} onChange={(e) => setEditing({ ...editing, next_service: e.target.value })} />
            </div>
            <Field label="AMC cost per year ₹ (optional)" inputMode="numeric" value={editing.amc_cost} onChange={(e) => setEditing({ ...editing, amc_cost: e.target.value.replace(/[^\d.]/g, "") })} />
            <Field label="Notes (optional)" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <PrimaryButton onClick={save}>Save</PrimaryButton>
          </div>
        </Modal>
      )}
      {logFor && (
        <Modal title={`Log service — ${logFor.name}`} onClose={() => setLogFor(null)}>
          <div className="space-y-4">
            <Field label="Service date" type="date" value={logForm.service_date} onChange={(e) => setLogForm({ ...logForm, service_date: e.target.value })} />
            <Field label="Technician name (optional)" value={logForm.technician} onChange={(e) => setLogForm({ ...logForm, technician: e.target.value })} />
            <Field label="Work done" placeholder="e.g. Routine service, oil change" value={logForm.work_done} onChange={(e) => setLogForm({ ...logForm, work_done: e.target.value })} />
            <Field label="Next service date (optional)" type="date" value={logForm.next_service} onChange={(e) => setLogForm({ ...logForm, next_service: e.target.value })} />
            <PrimaryButton onClick={saveLog}>Save</PrimaryButton>
          </div>
        </Modal>
      )}
    </main>
  );
}
