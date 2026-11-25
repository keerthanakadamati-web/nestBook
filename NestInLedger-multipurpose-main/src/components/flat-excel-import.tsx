import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { FLAT_COLUMNS, makeTempPassword, parseFlatGrid, type ParsedRow } from "@/lib/flat-import";
import { createResidentLogin } from "@/lib/residents.functions";

type LoginResult = { flat: string; name: string; email: string; password: string; status: string };

export async function downloadFlatTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([[...FLAT_COLUMNS], ["101", "1st Floor", "Owner", "Ramesh Kumar", "", "9876543210", "P-01", "4", "TS09AB1234", "", "123412341234", "ramesh@example.com"], ["102", "1st Floor", "Tenant", "Sita Devi", "Anil Rao", "9876500000", "P-02", "2", "TS10CD5678", "HT-5521", "432143214321", "sita@example.com"]]);
  ws["!cols"] = FLAT_COLUMNS.map((c) => ({ wch: Math.max(14, c.length + 2) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Flats");
  XLSX.writeFile(wb, "Flats-Upload-Template.xlsx");
}

async function downloadLogins(list: LoginResult[], society: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["Flat", "Owner", "Login Email", "First Password", "Status"], ...list.map((l) => [l.flat, l.name, l.email, l.password, l.status])]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Logins");
  XLSX.writeFile(wb, `${society.replace(/[^A-Za-z0-9]+/g, "-")}-Owner-Logins.xlsx`);
}

export function FlatExcelImport({ societyId, societyName, onClose, onDone }: { societyId: string; societyName: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [logins, setLogins] = useState<LoginResult[]>([]);
  const createLogin = useServerFn(createResidentLogin);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  async function pick(file: File | undefined) {
    setError(""); setDone(""); setRows(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("File is too big. Please keep it under 5 MB.");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!ws) return setError("The file has no sheet.");
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
      const parsed = parseFlatGrid(grid);
      if (!parsed.length) return setError("No flats found in the file.");
      setRows(parsed);
    } catch { setError("Could not read this file. Please use the template."); }
  }
  const bad = rows?.filter((r) => r.errors.length) ?? [];
  const good = rows?.filter((r) => !r.errors.length) ?? [];
  async function save() {
    setBusy(true); setError(""); setLogins([]);
    const { data, error: e } = await supabase.rpc("import_society_flats", { _society: societyId, _rows: good.map(({ row: { email: _e, ...rest } }) => rest) });
    if (e) { setBusy(false); return setError(e.message); }
    const d = data as { added: number; updated: number };
    const withEmail = good.filter((r) => r.row.email);
    const results: LoginResult[] = [];
    if (withEmail.length) {
      const { data: flats } = await supabase.from("flats").select("id, flat_number, resident_user_id").eq("society_id", societyId);
      for (const r of withEmail) {
        const f = (flats ?? []).find((x) => x.flat_number.trim().toLowerCase() === r.row.flat_number.trim().toLowerCase());
        const base = { flat: r.row.flat_number, name: r.row.owner_name, email: r.row.email, password: "" };
        if (!f) { results.push({ ...base, status: "Flat not found" }); continue; }
        if (f.resident_user_id) { results.push({ ...base, status: "Already has a login" }); continue; }
        const password = makeTempPassword(r.row.flat_number);
        try {
          const res = await createLogin({ data: { flatId: f.id, email: r.row.email, password } });
          if (res.ok) results.push({ ...base, password: res.linkedExisting ? "(their existing password)" : password, status: res.linkedExisting ? "Linked to existing login" : "Login created" });
          else results.push({ ...base, status: res.error });
        } catch (err) { results.push({ ...base, status: err instanceof Error ? err.message : "Could not create login" }); }
      }
    }
    setBusy(false); setLogins(results);
    const made = results.filter((x) => x.status === "Login created" || x.status === "Linked to existing login").length;
    setDone(`Saved: ${d.added} new flats added, ${d.updated} flats updated.${withEmail.length ? ` ${made} of ${withEmail.length} owner logins ready.` : ""}${bad.length ? ` ${bad.length} rows skipped.` : ""}`);
    setRows(null); onDone();
  }
  return <Modal title={`Upload flats · ${societyName}`} onClose={onClose}>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">1. Download the sample sheet. 2. Fill one row per flat. 3. Upload it here. Aadhaar is required; House Tax is optional. Add the owner email to create their login automatically. Flats already added are updated.</p>
      <Button variant="outline" className="w-full" onClick={() => void downloadFlatTemplate()}><Download className="h-4 w-4" />Download sample sheet</Button>
      <input type="file" accept=".xlsx,.xls,.csv" aria-label="Choose Excel file" onChange={(e) => void pick(e.target.files?.[0])} className="block w-full text-sm" />
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
      {logins.length > 0 && <div className="space-y-2">
        <Notice tone="ok">Share each owner's email and first password with them. Download this list now; passwords are not shown again.</Notice>
        <div className="max-h-64 overflow-auto rounded-lg border border-border"><table className="w-full text-xs"><thead className="bg-muted"><tr><th className="p-2 text-left">Flat</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Password</th><th className="p-2 text-left">Status</th></tr></thead>
          <tbody>{logins.map((l) => <tr key={l.flat} className="border-t border-border"><td className="p-2">{l.flat}</td><td className="p-2">{l.email}</td><td className="p-2 font-mono">{l.password || "—"}</td><td className="p-2">{l.status}</td></tr>)}</tbody></table></div>
        <Button variant="outline" className="w-full" onClick={() => void downloadLogins(logins, societyName)}><Download className="h-4 w-4" />Download login list</Button>
      </div>}
      {rows && <>
        <p className="text-sm"><b>{rows.length}</b> rows found · <span className="text-primary font-medium">{good.length} ready</span>{bad.length ? <> · <span className="text-destructive font-medium">{bad.length} with problems (will be skipped)</span></> : null}</p>
        <div className="max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs"><thead className="bg-muted"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Flat</th><th className="p-2 text-left">Owner</th><th className="p-2 text-left">Status</th></tr></thead>
            <tbody>{rows.slice(0, 200).map((r) => <tr key={r.line} className="border-t border-border"><td className="p-2">{r.line}</td><td className="p-2">{r.row.flat_number}</td><td className="p-2">{r.row.owner_name}{r.row.occupancy === "tenant" ? ` (Tenant: ${r.row.tenant_name || "—"})` : ""}</td><td className={`p-2 ${r.errors.length ? "text-destructive" : "text-primary"}`}>{r.errors.length ? r.errors.join(", ") : "OK"}</td></tr>)}</tbody></table>
        </div>
        <Button className="w-full" disabled={busy || !good.length} onClick={() => void save()}><Upload className="h-4 w-4" />{busy ? "Saving…" : `Save ${good.length} flats`}</Button>
      </>}
    </div>
  </Modal>;
}
