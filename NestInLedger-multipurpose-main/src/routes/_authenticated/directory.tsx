import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, MessageCircle, Search } from "lucide-react";

import { Field, Modal, Notice, Panel, PrimaryButton, QuietButton } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { canSubmitChanges } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/directory")({
  head: () => ({
    meta: [
      { title: "Emergency & Vendor Directory — NestInLedger" },
      { name: "description", content: "Important phone numbers for apartment residents." },
      { property: "og:title", content: "Emergency & Vendor Directory — NestInLedger" },
      { property: "og:description", content: "Important phone numbers for apartment residents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Directory,
});

type Contact = { id: string; name: string; category: string; phone: string; role_note: string | null; availability: string; contract_no: string | null };
const CATS: Record<string, string> = { emergency: "Emergency", technician: "Technicians", utility: "Utilities & Services", committee: "Committee", other: "Other" };
const empty = { name: "", category: "emergency", phone: "", role_note: "", availability: "daytime", contract_no: "" };

function Directory() {
  const { role, loading } = useSessionRole();
  const canEdit = canSubmitChanges(role);
  const [items, setItems] = useState<Contact[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<(typeof empty & { id?: string }) | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("society_directory").select("*").order("category").order("name");
    if (error) setMsg(error.message); else setItems(data as Contact[]);
  }, []);
  useEffect(() => { if (!loading) refresh(); }, [loading, refresh]);

  const shown = useMemo(() => items.filter((c) => (tab === "all" || c.category === tab) && `${c.name} ${c.role_note ?? ""} ${c.phone}`.toLowerCase().includes(q.toLowerCase())), [items, tab, q]);

  async function save() {
    if (!editing) return;
    const row = { name: editing.name.trim(), category: editing.category, phone: editing.phone.trim(), role_note: editing.role_note.trim() || null, availability: editing.availability, contract_no: editing.contract_no.trim() || null };
    if (!row.name || !row.phone) { setMsg("Please enter a name and phone number."); return; }
    const { error } = editing.id
      ? await supabase.from("society_directory").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editing.id)
      : await supabase.from("society_directory").insert(row);
    if (error) { setMsg(error.message.includes("check") ? "Please check the phone number (digits, +, spaces only)." : error.message); return; }
    setEditing(null); setMsg("Saved."); refresh();
  }
  async function remove(c: Contact) {
    if (!confirm(`Remove ${c.name}?`)) return;
    const { error } = await supabase.from("society_directory").delete().eq("id", c.id);
    setMsg(error ? error.message : "Removed."); refresh();
  }
  const wa = (p: string) => { const d = p.replace(/\D/g, ""); return `https://wa.me/${d.length === 10 ? "91" + d : d}`; };

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Emergency & Vendor Directory</h1>
          <p className="text-muted-foreground">Tap a number to call.</p>
        </div>
        {canEdit && <PrimaryButton onClick={() => setEditing({ ...empty })}>Add contact</PrimaryButton>}
      </div>
      <Notice tone={msg === "Saved." || msg === "Removed." ? "ok" : "error"}>{msg}</Notice>
      <div className="flex flex-wrap gap-2">
        {[["all", "All"], ...Object.entries(CATS)].map(([k, l]) => (
          <QuietButton key={k} onClick={() => setTab(k ?? "all")} className={tab === k ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""}>{l}</QuietButton>
        ))}
      </div>
      <label className="relative block">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or service" aria-label="Search contacts" className="w-full rounded-lg bg-card py-2.5 pl-9 pr-3 ring-1 ring-input outline-none focus:ring-2 focus:ring-ring" />
      </label>
      {shown.length === 0 ? (
        <Panel><p className="text-muted-foreground">{items.length === 0 ? (canEdit ? "No contacts yet. Tap “Add contact” to add the security desk, lift service, plumber and others." : "No contacts added yet.") : "No contacts match."}</p></Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((c) => (
            <Panel key={c.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{CATS[c.category]}</p>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  {c.role_note && <p className="text-sm text-muted-foreground">{c.role_note}</p>}
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${c.availability === "24x7" ? "bg-sage text-sage-deep" : "bg-muted text-muted-foreground"}`}>{c.availability === "24x7" ? "24/7" : "Daytime"}</span>
              </div>
              <p className="font-mono text-base">{c.phone}</p>
              {c.contract_no && <p className="text-sm text-muted-foreground">Contract no: {c.contract_no}</p>}
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Phone className="size-4" />Call</a>
                <a href={wa(c.phone)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold ring-1 ring-border"><MessageCircle className="size-4" />WhatsApp</a>
                {canEdit && <>
                  <QuietButton onClick={() => setEditing({ id: c.id, name: c.name, category: c.category, phone: c.phone, role_note: c.role_note ?? "", availability: c.availability, contract_no: c.contract_no ?? "" })}>Edit</QuietButton>
                  <QuietButton onClick={() => remove(c)}>Remove</QuietButton>
                </>}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? "Edit contact" : "Add contact"} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label className="block"><span className="text-sm font-medium text-muted-foreground">Type</span>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1.5 w-full rounded-lg bg-card px-3 py-2.5 ring-1 ring-input">
                {Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <Field label="Phone number" inputMode="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Field label="Service / note (optional)" placeholder="e.g. Lift technician, Plumber" value={editing.role_note} onChange={(e) => setEditing({ ...editing, role_note: e.target.value })} />
            <label className="block"><span className="text-sm font-medium text-muted-foreground">Available</span>
              <select value={editing.availability} onChange={(e) => setEditing({ ...editing, availability: e.target.value })} className="mt-1.5 w-full rounded-lg bg-card px-3 py-2.5 ring-1 ring-input">
                <option value="daytime">Daytime only</option><option value="24x7">24/7</option>
              </select></label>
            <Field label="Contract number (optional)" value={editing.contract_no} onChange={(e) => setEditing({ ...editing, contract_no: e.target.value })} />
            <PrimaryButton onClick={save}>Save</PrimaryButton>
          </div>
        </Modal>
      )}
    </main>
  );
}
