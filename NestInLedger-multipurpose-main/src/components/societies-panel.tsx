import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Modal, Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { clearSessionCache, useSessionRole } from "@/lib/session";
import { nextSocietyCode } from "@/lib/society-code";
import { FlatExcelImport } from "@/components/flat-excel-import";
import { CommitteeManager } from "@/components/society-committee";

type Society = { id: string; code: string; slug: string; name: string; city: string | null; total_flats: number; president_name: string | null; president_email: string | null; status: string; created_at: string };


export function SocietiesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { role } = useSessionRole();
  const [rows, setRows] = useState<Society[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Society | "new" | null>(null);
  const navigate = useNavigate();
  async function openSociety(id: string) {
    const r = await supabase.rpc("set_active_society", { _society: id });
    if (r.error) { alert("Could not switch apartment. Please try again."); return; }
    clearSessionCache();
    void navigate;
    window.location.href = "/dashboard?apartment=1";
  }
  const [error, setError] = useState("");
  const [importing, setImporting] = useState<Society | null>(null);
  const [committee, setCommittee] = useState<Society | null>(null);
  async function load() {
    const [s, c] = await Promise.all([
      supabase.from("societies").select("*").order("created_at"),
      supabase.rpc("society_flat_counts"),
    ]);
    if (s.error) setError(s.error.message);
    setRows((s.data ?? []) as Society[]);
    setCounts(Object.fromEntries((c.data ?? []).map((r) => [r.society_id, Number(r.flats)])));
  }
  useEffect(() => { void load(); }, []);
  if (role && role !== "admin") return <main className="p-8"><h1 className="text-2xl font-bold">Only the Admin can open this page.</h1></main>;
  return <section className={embedded ? "mt-8" : "mx-auto max-w-6xl p-4 md:p-8"}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-primary" />Societies</h1><p className="mt-1 text-sm text-muted-foreground">All apartments using NestInLedger. Each one gets its own code (s1, s2…).</p></div>
      <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add society</Button>
    </div>
    {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    {!rows ? <p className="mt-8 text-muted-foreground">Loading…</p> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => <article key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2"><span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold uppercase text-primary-foreground">{s.code}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.status === "active" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{s.status === "active" ? "Active" : "Paused"}</span></div>
        <h2 className="mt-3 text-lg font-semibold">{s.name}</h2>
        <p className="text-sm text-muted-foreground">{s.city || "City not set"}</p>
        <p className="mt-2 break-all text-sm">nestinledger.com/<span className="font-medium">{s.slug}</span></p>
        <p className="mt-2 text-sm">Flats added: <b>{counts[s.id] ?? 0}</b> of {s.total_flats}</p>
        <p className="text-sm text-muted-foreground">President: {s.president_name || "—"}{s.president_email ? ` · ${s.president_email}` : ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setEditing(s)}>Edit</Button><Button onClick={() => setImporting(s)}>Upload Excel</Button><Button className="col-span-2" variant="secondary" onClick={() => setCommittee(s)}>Manage Committee</Button><Button className="col-span-2" variant="outline" onClick={() => openSociety(s.id)}>Open this apartment</Button></div>
      </article>)}
    </div>}
    {importing && <FlatExcelImport societyId={importing.id} societyName={importing.name} onClose={() => setImporting(null)} onDone={() => void load()} />}
    {editing && <SocietyForm society={editing === "new" ? undefined : editing} code={editing === "new" ? nextSocietyCode((rows ?? []).map((r) => r.code)) : editing.code} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    {committee && <CommitteeManager society={committee} onClose={() => setCommittee(null)} />}
  </section>;
}

function SocietyForm({ society, code, onClose, onSaved }: { society?: Society | undefined; code: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(society?.name ?? "");
  const [slug, setSlug] = useState(society?.slug ?? "");
  const [city, setCity] = useState(society?.city ?? "");
  const [flats, setFlats] = useState(String(society?.total_flats ?? ""));
  const [pName, setPName] = useState(society?.president_name ?? "");
  const [pEmail, setPEmail] = useState(society?.president_email ?? "");
  const [status, setStatus] = useState(society?.status ?? "active");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const values = { name: name.trim(), slug: slug.trim().toLowerCase(), city: city.trim() || null, total_flats: Number(flats) || 0, president_name: pName.trim() || null, president_email: pEmail.trim().toLowerCase() || null, status, updated_at: new Date().toISOString() };
    const r = society ? await supabase.from("societies").update(values).eq("id", society.id) : await supabase.from("societies").insert({ ...values, code });
    setBusy(false);
    if (r.error) setError(/duplicate|unique/i.test(r.error.message) ? "This web name is already used. Please choose another." : /slug/i.test(r.error.message) ? "Web name can use only small letters, numbers and '-'." : r.error.message);
    else await onSaved();
  }
  return <Modal title={society ? `Edit ${code.toUpperCase()}` : `Add society · ${code.toUpperCase()}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <Field label="Society name" value={name} required onChange={(e) => { setName(e.target.value); if (!society) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)); }} />
      <Field label="Web name (nestinledger.com/…)" value={slug} required onChange={(e) => setSlug(e.target.value)} />
      <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <Field label="Number of flats" type="number" min={0} max={5000} value={flats} required onChange={(e) => setFlats(e.target.value)} />
      <Field label="President name" value={pName} onChange={(e) => setPName(e.target.value)} />
      <Field label="President email" type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} />
      {society && <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={status === "active"} onChange={() => setStatus("active")} />Active</label><label className="flex items-center gap-2"><input type="radio" checked={status === "paused"} onChange={() => setStatus("paused")} />Paused</label></div>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : society ? "Save changes" : "Add society"}</Button>
    </form>
  </Modal>;
}
