import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Field, Modal, Notice } from "@/components/app-ui";
import { getResidentLogin, updateResidentLogin } from "@/lib/residents.functions";

export function ManageLoginForm({ flat, onClose, onSaved }: { flat: { id: string; flat_number: string }; onClose: () => void; onSaved: () => Promise<void> }) {
  const get = useServerFn(getResidentLogin);
  const update = useServerFn(updateResidentLogin);
  const [current, setCurrent] = useState<string | null>(null);
  const [others, setOthers] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    get({ data: { flatId: flat.id } }).then((r) => { setCurrent(r.email); setOthers(r.otherFlats); setEmail(r.email ?? ""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load the login."));
  }, [flat.id, get]);

  async function run(action: "email" | "password" | "unlink") {
    if (action === "unlink" && !confirm(`Remove the login from flat ${flat.flat_number}? The owner will no longer see this flat.`)) return;
    setBusy(true); setError(""); setOk("");
    try {
      const r = await update({ data: { flatId: flat.id, action, ...(action === "email" ? { email } : {}), ...(action === "password" ? { password } : {}) } });
      if (!r.ok) { setError(r.error); return; }
      if (action === "unlink") { await onSaved(); return; }
      if (action === "email") setCurrent(email.trim().toLowerCase());
      setPassword("");
      setOk(action === "email" ? "Login email changed. The owner signs in with the new email now." : "New password saved. Share it with the owner.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }

  return <Modal title={`Manage login · ${flat.flat_number}`} onClose={onClose}>
    <div className="space-y-5">
      <p className="text-sm">Current login email: <strong className="break-all">{current ?? "Loading…"}</strong></p>
      {others.length > 0 && <p className="text-sm text-muted-foreground">This login is also used for flats {others.join(", ")}. Email and password changes apply to all of them.</p>}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run("email"); }}>
        <Field label="New login email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={busy || !email.trim() || email.trim().toLowerCase() === current}>Change email</Button>
      </form>
      <form className="space-y-3 border-t border-border pt-4" onSubmit={(e) => { e.preventDefault(); void run("password"); }}>
        <Field label="New temporary password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" disabled={busy || password.length < 6}>Set new password</Button>
      </form>
      <div className="border-t border-border pt-4">
        <Button variant="outline" disabled={busy} onClick={() => void run("unlink")}>Remove login from this flat</Button>
      </div>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  </Modal>;
}
