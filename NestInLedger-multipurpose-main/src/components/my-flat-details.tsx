import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Notice, Panel } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Details = { id: string; flat_number: string; mobile: string; floor: string | null; parking_slot: string | null; vehicle_type: string | null; vehicle_numbers: string | null; house_tax_number: string | null; aadhaar_number: string | null };
const vehicleLabel: Record<string, string> = { none: "No vehicle", "2-wheeler": "2-wheeler", "4-wheeler": "4-wheeler", both: "2 & 4-wheeler" };

export function MyFlatDetails({ userId }: { userId: string }) {
  const [flats, setFlats] = useState<Details[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.from("flats").select("id, flat_number, mobile, floor, parking_slot, vehicle_type, vehicle_numbers, house_tax_number, aadhaar_number").eq("resident_user_id", userId).order("flat_number");
    setFlats(r.data ?? []);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);
  if (!flats.length) return null;
  return <>{flats.map((f) => editing === f.id
    ? <EditForm key={f.id} flat={f} onDone={async () => { setEditing(null); await load(); }} />
    : <Panel key={f.id} className="mt-6">
      <div className="flex items-center justify-between gap-3"><p className="font-display text-xl font-semibold tracking-tight">Flat {f.flat_number} details</p><Button size="sm" variant="outline" onClick={() => setEditing(f.id)}><Pencil />Edit</Button></div>
      <dl className="mt-4 space-y-3 text-sm">{[["Mobile", f.mobile], ["Floor", f.floor], ["Parking slot", f.parking_slot], ["Vehicle", f.vehicle_type ? vehicleLabel[f.vehicle_type] ?? f.vehicle_type : null], ["Vehicle numbers", f.vehicle_numbers], ["House tax number", f.house_tax_number], ["Aadhaar", f.aadhaar_number ? `XXXX XXXX ${f.aadhaar_number.slice(-4)}` : null]].map(([k, v]) => <div key={k} className="flex flex-wrap justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words font-medium">{v || "—"}</dd></div>)}</dl>
      <p className="mt-3 text-xs text-muted-foreground">To change flat number or Aadhaar, ask the committee.</p>
    </Panel>)}</>;
}

function EditForm({ flat, onDone }: { flat: Details; onDone: () => Promise<void> }) {
  const [v, setV] = useState({ mobile: flat.mobile ?? "", floor: flat.floor ?? "", parking: flat.parking_slot ?? "", type: flat.vehicle_type ?? "none", numbers: flat.vehicle_numbers ?? "", tax: flat.house_tax_number ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return <Panel className="mt-6"><p className="font-display text-xl font-semibold tracking-tight">Edit flat {flat.flat_number}</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError("");
      const r = await supabase.rpc("update_my_flat_details", { _flat_id: flat.id, _mobile: v.mobile.replace(/\D/g, ""), _floor: v.floor, _parking_slot: v.parking, _vehicle_type: v.type, _vehicle_numbers: v.type === "none" ? "" : v.numbers, _house_tax_number: v.tax });
      setBusy(false); if (r.error) setError(r.error.message.includes("10 digits") ? "Mobile must be 10 digits." : "Could not save. Please try again."); else await onDone(); }}>
      <label className="text-sm">Mobile<Input inputMode="numeric" maxLength={10} required value={v.mobile} onChange={set("mobile")} /></label>
      <label className="text-sm">Floor<Input maxLength={20} value={v.floor} onChange={set("floor")} /></label>
      <label className="text-sm">Parking slot<Input maxLength={30} value={v.parking} onChange={set("parking")} /></label>
      <label className="text-sm">Vehicle<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={v.type} onChange={set("type")}>{Object.entries(vehicleLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {v.type !== "none" && <label className="text-sm sm:col-span-2">Vehicle numbers<Input maxLength={120} placeholder="e.g. TS09AB1234, TS07CD5678" value={v.numbers} onChange={set("numbers")} /></label>}
      <label className="text-sm sm:col-span-2">House tax number<Input maxLength={40} value={v.tax} onChange={set("tax")} /></label>
      {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="outline" onClick={() => void onDone()}>Cancel</Button></div>
    </form></Panel>;
}
