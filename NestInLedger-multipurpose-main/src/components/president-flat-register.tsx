import { useState } from "react";
import * as XLSX from "xlsx";
import { Eye, EyeOff, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// President-only: full Aadhaar reveal and one-click complete flat register download.
export type RegisterRow = { id: string; flat_number: string; floor: string | null; resident_name: string; mobile: string; owner_email: string | null; occupancy: string; tenant_name: string | null; tenant_phone: string | null; tenant_email: string | null; parking_slot: string | null; vehicle_type: string | null; vehicle_numbers: string | null; house_tax_number: string | null; aadhaar_number: string | null };

async function fetchRegister() {
  const r = await supabase.rpc("president_flat_register");
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as RegisterRow[];
}

export function PresidentFlatTools({ onReveal }: { onReveal: (map: Record<string, string> | null) => void }) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    if (shown) { onReveal(null); setShown(false); return; }
    setBusy(true); setError("");
    try { const rows = await fetchRegister(); onReveal(Object.fromEntries(rows.filter((r) => r.aadhaar_number).map((r) => [r.id, r.aadhaar_number as string]))); setShown(true); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const rows = await fetchRegister();
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({ "Flat": r.flat_number, "Floor": r.floor ?? "", "Owner": r.resident_name, "Mobile": r.mobile, "Email": r.owner_email ?? "", "Lives here": r.occupancy === "rented" ? "Tenant" : "Owner", "Tenant": r.tenant_name ?? "", "Tenant mobile": r.tenant_phone ?? "", "Tenant email": r.tenant_email ?? "", "Parking": r.parking_slot ?? "", "Vehicle": r.vehicle_type ?? "", "Vehicle numbers": r.vehicle_numbers ?? "", "House tax no.": r.house_tax_number ?? "", "Aadhaar": r.aadhaar_number ?? "" })));
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Flat Register");
      XLSX.writeFile(book, `Flat_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Button variant="outline" disabled={busy} onClick={toggle}>{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{shown ? "Hide full Aadhaar" : "Show full Aadhaar"}</Button>
    <Button variant="outline" disabled={busy} onClick={download}><Download className="h-4 w-4" />Download flat register</Button>
    {error && <p className="w-full text-sm text-destructive">{error}</p>}
  </div>;
}
