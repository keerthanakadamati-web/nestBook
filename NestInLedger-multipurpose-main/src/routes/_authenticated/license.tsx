import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { daysLeft, extendBy } from "@/lib/license";

export const Route = createFileRoute("/_authenticated/license")({
  head: () => ({ meta: [{ title: "Website Renewal — NestInLedger" }, { name: "description", content: "Admin controls for the yearly website subscription and renewals." }, { property: "og:title", content: "Website Renewal — NestInLedger" }, { property: "og:description", content: "Renew the society website subscription." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LicensePage,
});

type Renewal = { id: string; old_expires_on: string; new_expires_on: string; note: string | null; renewed_at: string };

function LicensePage() {
  const { role, societyName } = useSessionRole();
  const [expires, setExpires] = useState<string | null>(null);
  const [history, setHistory] = useState<Renewal[]>([]);
  const [custom, setCustom] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function load() {
    const [l, h] = await Promise.all([
      supabase.from("society_license").select("expires_on").eq("id", true).maybeSingle(),
      supabase.from("license_renewals").select("id,old_expires_on,new_expires_on,note,renewed_at").order("renewed_at", { ascending: false }),
    ]);
    setExpires(l.data?.expires_on ?? null); setHistory(h.data ?? []);
  }
  useEffect(() => { void load(); }, []);
  if (role && role !== "admin") return <main className="p-8"><h1 className="text-2xl font-bold">Only the Admin can open this page.</h1></main>;
  if (!expires) return <main className="p-8 text-muted-foreground">Loading…</main>;
  const left = daysLeft(expires);
  const status = left < 0 ? { label: "Expired", tone: "text-destructive" } : left <= 30 ? { label: "Ending soon", tone: "text-destructive" } : { label: "Active", tone: "text-primary" };
  async function renew(date: string) {
    setBusy(true); setError(""); setMessage("");
    const r = await supabase.rpc("renew_license", { _new_date: date, _note: note });
    setBusy(false);
    if (r.error) setError(r.error.message); else { setMessage(`Renewed. New end date: ${date}.`); setNote(""); setCustom(""); await load(); }
  }
  async function removeEntry(id?: string) {
    if (!window.confirm(id ? "Delete this renewal entry? The end date stays the same." : "Clear all renewal history? The end date stays the same.")) return;
    setBusy(true); setError(""); setMessage("");
    const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    const r = id ? await rpc("delete_license_renewal", { _id: id }) : await rpc("clear_license_renewals");
    setBusy(false);
    if (r.error) setError(r.error.message); else { setMessage(id ? "Entry deleted." : "History cleared."); await load(); }
  }
  return <main className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-3xl">
    <p className="text-sm font-semibold uppercase text-muted-foreground">{societyName ?? "NestInLedger"}</p>
    <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold"><BadgeCheck className="size-7 text-primary" />Website Renewal</h1>
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Status: <span className={status.tone}>{status.label}</span></h2>
      <p className="mt-1 text-sm text-muted-foreground">Ends on {expires} · {left < 0 ? `${-left} days ago` : `${left} days left`}</p>
      <p className="mt-2 text-sm">After this date everyone except you sees a "subscription expired" screen. No data is deleted.</p>
    </section>
    <section className="mt-6 space-y-4">
      <div><Label htmlFor="note">Note (optional, e.g. fee received)</Label><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => renew(extendBy(expires, 12))}>Renew 1 year</Button>
        <Button variant="outline" disabled={busy} onClick={() => renew(extendBy(expires, 3))}>Add 3 months</Button>
        <Button variant="outline" disabled={busy} onClick={() => renew(extendBy(expires, 1))}>Add 1 month</Button>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (custom) void renew(custom); }}>
        <div><Label htmlFor="custom">Or choose an end date</Label><Input id="custom" type="date" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
        <Button variant="outline" type="submit" disabled={busy || !custom}>Set date</Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="ok">{message}</Notice>}
    </section>
    <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Renewal history</h2>{history.length > 0 && <Button variant="outline" size="sm" disabled={busy} onClick={() => removeEntry()}>Clear all history</Button>}</div>
      <p className="mt-1 text-sm text-muted-foreground">To change the end date, pick a new date above and tap Set date.</p>
      {!history.length && <p className="mt-3 text-sm text-muted-foreground">No renewals yet.</p>}
      {history.map((h) => <div key={h.id} className="mt-3 flex items-center justify-between gap-2 border-b border-border pb-3 text-sm"><p>{h.renewed_at.slice(0, 10)} · {h.old_expires_on} → <b>{h.new_expires_on}</b>{h.note ? ` · ${h.note}` : ""}</p><Button variant="ghost" size="sm" disabled={busy} onClick={() => removeEntry(h.id)}>Delete</Button></div>)}
    </section>
  </div></main>;
}
