import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Field, Modal, Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { saveSocietyCommitteeMember } from "@/lib/society-committee.functions";

const ROLES = [
  { value: "president", label: "President" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
] as const;
type Role = (typeof ROLES)[number]["value"];
type Member = { role: string; full_name: string | null; email: string };

export function CommitteeManager({ society, onClose }: { society: { id: string; code: string; name: string }; onClose: () => void }) {
  const save = useServerFn(saveSocietyCommitteeMember);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<Role>("president");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  async function load() {
    const r = await supabase.from("society_committee").select("role, full_name, email").eq("society_id", society.id);
    setMembers(r.data ?? []);
  }
  useEffect(() => { void load(); }, [society.id]);
  function pick(r: Role) {
    setRole(r); setError(""); setDone(""); setPassword("");
    const m = members.find((x) => x.role === r);
    setName(m?.full_name ?? ""); setEmail(m?.email ?? "");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setDone("");
    try {
      const r = await save({ data: { societyId: society.id, role, fullName: name, email, password } });
      if (!r.ok) setError(r.error);
      else { setDone(r.active ? "Saved. They can sign in now." : "Saved. Login is ready; their apartment pages open once this apartment's own data is set up."); setPassword(""); await load(); }
    } catch { setError("Could not save. Please check the details and try again."); }
    finally { setBusy(false); }
  }
  return <Modal title={`Committee · ${society.name}`} onClose={onClose}>
    <div className="space-y-2">
      {ROLES.map((r) => { const m = members.find((x) => x.role === r.value); return (
        <button key={r.value} type="button" onClick={() => pick(r.value)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${role === r.value ? "border-primary bg-accent" : "border-border"}`}>
          <span className="font-semibold">{r.label}</span>
          <span className="truncate text-sm text-muted-foreground">{m ? `${m.full_name ?? ""} · ${m.email}` : "Not set"}</span>
        </button>); })}
    </div>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <Field label={`${ROLES.find((r) => r.value === role)?.label} name`} value={name} required onChange={(e) => setName(e.target.value)} />
      <Field label="Login email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
      <Field label="Password (only for a new login)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save login"}</Button>
    </form>
  </Modal>;
}
