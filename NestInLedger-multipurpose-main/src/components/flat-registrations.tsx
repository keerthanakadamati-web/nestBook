import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, MessageCircle, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Notice, Panel } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { maskAadhaar, whatsappInvite } from "@/lib/flat-registration";
import { useServerFn } from "@tanstack/react-start";
import { approveFlatRegistration } from "@/lib/residents.functions";
import type { Tables } from "@/integrations/supabase/types";

type Row = Tables<"flat_registrations">;

export function FlatRegistrations() {
  const { role } = useSessionRole();
  const visible = role === "president" || role === "secretary" || role === "admin";
  const canImport = role === "president" || role === "admin";
  const [rows, setRows] = useState<Row[]>([]);
  const [society, setSociety] = useState<{ slug: string; name: string } | null>(null);
  const approve = useServerFn(approveFlatRegistration);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    const s = await supabase.rpc("my_society");
    if (s.data?.[0]) setSociety({ slug: s.data[0].slug, name: s.data[0].name });
    const r = await supabase.from("flat_registrations").select("*").order("created_at", { ascending: false }).limit(500);
    setRows(r.data ?? []);
  }, []);
  useEffect(() => { if (visible) void load(); }, [visible, load]);
  if (!visible || !society) return null;
  const link = `https://nestinledger.com/onboard/${society.slug}`;
  const pending = rows.filter((r) => r.status === "pending");

  async function decide(id: string, ok: boolean) {
    if (ok) {
      try {
        const r = await approve({ data: { id } });
        setMsg(r.login === "created" ? { tone: "ok", text: `Flat added. Login created: ${r.email} — password is their mobile number.` } : r.login === "exists" ? { tone: "ok", text: "Flat added. This flat already had a login." } : r.login === "no-email" ? { tone: "ok", text: "Flat added. No email given, so use Create login on Flats & Residents." } : { tone: "error", text: r.error ?? "Flat added, but login failed." });
      } catch (e) { setMsg({ tone: "error", text: e instanceof Error && /15|capacity/i.test(e.message) ? "Flat limit reached." : "Could not add. Please try again." }); }
      await load(); return;
    }
    const r = await supabase.rpc("decide_flat_registration", { _id: id, _import: ok });
    setMsg(r.error ? { tone: "error", text: r.error.message.includes("15") || r.error.message.toLowerCase().includes("capacity") ? "Flat limit reached." : "Could not update. Please try again." } : { tone: "ok", text: ok ? "Flat added." : "Removed from list." });
    await load();
  }
  function exportExcel() {
    const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({ "Flat": r.flat_number, "Floor": r.floor ?? "", "Owner": r.owner_name, "Mobile": r.mobile, "Email": r.owner_email ?? "", "Lives here": r.occupancy === "owner" ? "Owner" : "Tenant", "Tenant": r.tenant_name ?? "", "Tenant mobile": r.tenant_phone ?? "", "Parking": r.parking_slot ?? "", "Vehicle": r.vehicle_type ?? "", "Vehicle numbers": r.vehicle_numbers ?? "", "House tax no.": r.house_tax_number ?? "", "Aadhaar": maskAadhaar(r.aadhaar_number), "Status": r.status, "Sent on": r.created_at.slice(0, 10) })));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Flat details");
    XLSX.writeFile(book, `${society!.name.replace(/\s+/g, "-")}-flat-details.xlsx`);
  }

  return (
    <Panel className="mt-6">
      <p className="font-display text-xl font-semibold tracking-tight">Flat details form</p>
      <p className="mt-1 text-sm text-muted-foreground">Share this form in your WhatsApp group. Owners fill it from their phone.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild><a href={whatsappInvite(society.name, link)} target="_blank" rel="noreferrer"><MessageCircle />Share on WhatsApp</a></Button>
        <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link); setMsg({ tone: "ok", text: "Link copied." }); }}><Copy />Copy link</Button>
        {rows.length > 0 && <Button variant="outline" onClick={exportExcel}><Download />Download Excel</Button>}
      </div>
      <p className="mt-3 text-sm"><b>{pending.length}</b> waiting · <b>{rows.filter((r) => r.status === "imported").length}</b> added</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {pending.length > 0 && <ul className="mt-3 divide-y divide-border">{pending.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 text-sm"><p className="font-semibold">Flat {r.flat_number}{r.floor ? ` · Floor ${r.floor}` : ""} · {r.owner_name}</p>
            <p className="text-muted-foreground">{r.mobile}{r.owner_email ? ` · ${r.owner_email}` : ""} · {r.occupancy === "owner" ? "Owner lives here" : `Tenant: ${r.tenant_name}`} · Aadhaar {maskAadhaar(r.aadhaar_number)}{r.vehicle_numbers ? ` · ${r.vehicle_numbers}` : ""}</p></div>
          {canImport && <div className="flex gap-2"><Button size="sm" onClick={() => decide(r.id, true)}><Check />Add flat</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, false)}><X />Reject</Button></div>}
        </li>))}</ul>}
    </Panel>
  );
}
