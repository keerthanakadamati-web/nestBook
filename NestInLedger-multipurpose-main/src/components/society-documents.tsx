import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { shortDate } from "@/lib/format";

const CATEGORIES = ["Equipment Warranties", "AMC & Service Contracts", "Licenses & NOCs", "Insurance", "General"];
const MAX = 10 * 1024 * 1024;
type Doc = { id: string; title: string; category: string; vendor: string | null; valid_until: string | null; notes: string | null; file_path: string; file_name: string; created_at: string };

export function SocietyDocuments() {
  const { role, userId } = useSessionRole();
  const canManage = role === "admin" || role === "president" || role === "secretary" || role === "treasurer";
  const [docs, setDocs] = useState<Doc[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "General", vendor: "", valid_until: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const { data } = await supabase.from("society_files").select("*").order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  }
  useEffect(() => { load(); }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (!file || !form.title.trim()) return setMsg("Please add a title and choose a file.");
    if (file.size > MAX) return setMsg("File is too big. Maximum is 10 MB.");
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return setMsg("Only PDF, JPG or PNG files.");
    setBusy(true);
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from("society-documents").upload(path, file);
    if (up.error) { setBusy(false); return setMsg("Upload failed. Please try again."); }
    const { error } = await supabase.from("society_files").insert({
      title: form.title.trim(), category: form.category, vendor: form.vendor.trim() || null,
      valid_until: form.valid_until || null, notes: form.notes.trim() || null,
      file_path: path, file_name: file.name, file_size: file.size, uploaded_by: userId!,
    });
    if (error) { await supabase.storage.from("society-documents").remove([path]); setBusy(false); return setMsg("Could not save the document."); }
    setBusy(false); setOpen(false); setFile(null); setForm({ title: "", category: "General", vendor: "", valid_until: "", notes: "" });
    load();
  }

  async function view(d: Doc) {
    const { data } = await supabase.storage.from("society-documents").createSignedUrl(d.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  async function remove(d: Doc) {
    if (!confirm(`Delete "${d.title}"?`)) return;
    await supabase.from("society_files").delete().eq("id", d.id);
    await supabase.storage.from("society-documents").remove([d.file_path]);
    load();
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Society & service documents</h2>
        {canManage && <Button onClick={() => setOpen(!open)}>{open ? "Close" : "Upload document"}</Button>}
      </div>
      {open && canManage && (
        <form onSubmit={upload} className="mt-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
          <label className="text-sm">Title<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lift warranty" /></label>
          <label className="text-sm">Category<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm">Service provider (optional)<Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label>
          <label className="text-sm">Valid until (optional)<Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></label>
          <label className="text-sm md:col-span-2">Notes (optional)<Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <label className="text-sm md:col-span-2">File (PDF, JPG or PNG, up to 10 MB)<Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          {msg && <p className="text-sm text-destructive md:col-span-2">{msg}</p>}
          <div className="md:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Save document"}</Button></div>
        </form>
      )}
      {!docs.length && <p className="py-6 text-muted-foreground">No documents uploaded yet.</p>}
      <div className="mt-4 divide-y divide-border">
        {docs.map((d) => (
          <article key={d.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <h3 className="font-semibold">{d.title}</h3>
              <p className="text-sm text-muted-foreground">{d.category}{d.vendor ? ` · ${d.vendor}` : ""}{d.valid_until ? ` · Valid until ${shortDate(d.valid_until)}` : ""}</p>
              {d.notes && <p className="text-sm">{d.notes}</p>}
              <p className="text-xs text-muted-foreground">Uploaded {shortDate(d.created_at)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => view(d)}>View</Button>
              {canManage && <Button variant="outline" onClick={() => remove(d)}>Delete</Button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
