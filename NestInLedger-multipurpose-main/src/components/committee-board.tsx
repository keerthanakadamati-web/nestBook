import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Printer, Trash2, ArrowUp } from "lucide-react";
import { Field, Modal, Notice, Panel } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";

type Member = { name: string; designation: string };
type Board = { association_name: string; registration_details: string; office_address: string; meeting_date: string | null; term: string; members: Member[] };
const DESIGNATIONS = ["President", "Vice President", "Secretary", "Joint Secretary", "Treasurer", "Joint Treasurer", "Adviser", "Legal Adviser", "Executive Member"];
const fmt = (d: string | null) => (d ? d.split("-").reverse().join(".") : "");

export function CommitteeBoard() {
  const { role } = useSessionRole();
  const canEdit = role === "president" || role === "admin";
  const [board, setBoard] = useState<Board | null>(null);
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Board | null>(null);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const s = await supabase.rpc("my_society");
    const id = s.data?.[0]?.id ?? null;
    setSocietyId(id);
    if (id) {
      const r = await supabase.from("society_board").select("*").eq("society_id", id).maybeSingle();
      if (r.data) setBoard({ ...r.data, members: (r.data.members as Member[]) ?? [] });
      else setBoard(null);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!editing || !societyId) return;
    const members = editing.members.map((m) => ({ name: m.name.trim(), designation: m.designation.trim() })).filter((m) => m.name);
    const row = { society_id: societyId, ...editing, members, updated_at: new Date().toISOString() };
    const r = await supabase.from("society_board").upsert(row);
    if (r.error) { setMsg("Could not save. Please try again."); return; }
    setEditing(null); setMsg(""); await load();
  }
  if (!loaded) return null;
  if (!board && !canEdit) return null;
  const blank: Board = { association_name: "", registration_details: "", office_address: "", meeting_date: null, term: "", members: [] };

  return (
    <Panel className="mt-6 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-xl font-semibold tracking-tight">Elected Managing Committee</p>
        <div className="flex gap-2 print:hidden">
          {board && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer />Print</Button>}
          {canEdit && <Button size="sm" onClick={() => setEditing(board ? structuredClone(board) : blank)}>{board ? <><Pencil />Edit</> : <><Plus />Add committee</>}</Button>}
        </div>
      </div>
      {!board ? <p className="mt-3 text-sm text-muted-foreground">No committee added yet. Tap “Add committee” so all members can see it.</p> : (
        <div className="mt-4 rounded-lg border-2 border-primary/30 p-4 text-center sm:p-6">
          {board.association_name && <p className="font-display text-lg font-bold uppercase text-primary sm:text-xl">{board.association_name}</p>}
          {board.registration_details && <p className="mt-1 text-sm text-muted-foreground">{board.registration_details}</p>}
          {(board.meeting_date || board.term) && <p className="mt-4 text-sm">{board.meeting_date && <>General body meeting held on <b>{fmt(board.meeting_date)}</b>. </>}{board.term && <>Elected for <b>{board.term}</b>.</>}</p>}
          <ol className="mx-auto mt-4 max-w-lg divide-y divide-border text-left">
            {board.members.map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0"><span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span><span className="font-medium">{m.name}</span></span>
                <span className="shrink-0 text-sm font-semibold text-primary">{m.designation}</span>
              </li>
            ))}
          </ol>
          {board.office_address && <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Registered office: {board.office_address}</p>}
        </div>
      )}
      {editing && (
        <Modal title="Committee details" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Association name" placeholder="e.g. Flat Owners Welfare Association" value={editing.association_name} onChange={(e) => setEditing({ ...editing, association_name: e.target.value })} />
            <Field label="Registration details (optional)" placeholder="e.g. Society No.170 of 2010" value={editing.registration_details} onChange={(e) => setEditing({ ...editing, registration_details: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="General body meeting date" type="date" value={editing.meeting_date ?? ""} onChange={(e) => setEditing({ ...editing, meeting_date: e.target.value || null })} />
              <Field label="Elected for (term)" placeholder="e.g. 2026 – 2027" value={editing.term} onChange={(e) => setEditing({ ...editing, term: e.target.value })} />
            </div>
            <Field label="Registered office address (optional)" value={editing.office_address} onChange={(e) => setEditing({ ...editing, office_address: e.target.value })} />
            <p className="text-sm font-semibold">Members</p>
            <datalist id="designations">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>
            {editing.members.map((m, i) => (
              <div key={i} className="flex items-end gap-2">
                <span className="pb-3 text-sm text-muted-foreground">{i + 1}.</span>
                <div className="flex-1"><Field label="Name" value={m.name} onChange={(e) => setEditing({ ...editing, members: editing.members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></div>
                <div className="flex-1"><Field label="Post" list="designations" value={m.designation} onChange={(e) => setEditing({ ...editing, members: editing.members.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)) })} /></div>
                <Button variant="outline" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => { const a = [...editing.members]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; setEditing({ ...editing, members: a }); }}><ArrowUp /></Button>
                <Button variant="outline" size="icon" aria-label="Remove member" onClick={() => setEditing({ ...editing, members: editing.members.filter((_, j) => j !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setEditing({ ...editing, members: [...editing.members, { name: "", designation: "Executive Member" }] })}><Plus />Add member</Button>
            {msg && <Notice tone="error">{msg}</Notice>}
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
