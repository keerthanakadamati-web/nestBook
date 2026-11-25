import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bug, Smartphone, KeyRound, CreditCard, Mail, Gauge, HelpCircle, ImagePlus, Send, CheckCircle2, LifeBuoy, X, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { notifySupportTicket } from "@/lib/support.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/page-loader";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [
    { title: "Technical Support · NestInLedger" },
    { name: "description", content: "Ask the website developer for help with any technical problem." },
    { property: "og:title", content: "Technical Support · NestInLedger" },
    { property: "og:description", content: "Ask the website developer for help with any technical problem." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SupportPage,
});

const TYPES: { label: string; icon: LucideIcon; hint: string }[] = [
  { label: "Something is broken", icon: Bug, hint: "A page or button is not working" },
  { label: "Login problem", icon: KeyRound, hint: "Cannot sign in or reset password" },
  { label: "Payment or receipt", icon: CreditCard, hint: "Wrong amount, missing receipt" },
  { label: "Emails or alerts", icon: Mail, hint: "Reminders or notices not arriving" },
  { label: "Phone / app issue", icon: Smartphone, hint: "Problem on mobile or installed app" },
  { label: "Slow website", icon: Gauge, hint: "Pages take long to open" },
  { label: "Other", icon: HelpCircle, hint: "Anything else" },
];

type Ticket = { id: string; category: string; description: string; status: string; created_at: string; created_email: string | null; image_path: string | null };

function SupportPage() {
  const { role, loading, userId, email } = useSessionRole();
  const notify = useServerFn(notifySupportTicket);
  const [type, setType] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const canRaise = role === "president" || role === "secretary";
  const isAdmin = role === "admin";

  const load = async () => { const r = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(50); setTickets((r.data ?? []) as Ticket[]); };
  useEffect(() => { if (!loading && userId) void load(); }, [loading, userId]);
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);

  if (loading) return <PageLoader title="Loading support…" />;
  if (!canRaise && !isAdmin) return <main className="p-6"><p>Technical support is available for the President and Secretary.</p></main>;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setMsg({ ok: false, text: "Please choose a JPG, PNG or WEBP picture." });
    if (f.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: "Picture must be 5 MB or smaller." });
    setMsg(null); setFile(f);
  };

  const submit = async () => {
    if (!type) return setMsg({ ok: false, text: "Please choose the type of help you need." });
    if (text.trim().length < 5) return setMsg({ ok: false, text: "Please describe the problem in a few words." });
    setBusy(true); setMsg(null);
    let image_path: string | null = null;
    if (file) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      image_path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("support-screenshots").upload(image_path, file);
      if (up.error) { setBusy(false); return setMsg({ ok: false, text: "Could not upload the picture. Please try again." }); }
    }
    const ins = await supabase.from("support_tickets").insert({ category: type, description: text.trim(), image_path, created_email: email, created_by: userId! }).select("id").single();
    if (ins.error || !ins.data) { setBusy(false); return setMsg({ ok: false, text: "Could not send the request. Please try again." }); }
    const r = await notify({ data: { id: ins.data.id } });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Sent! The website developer has been emailed and notified." } : { ok: false, text: r.error });
    setType(""); setText(""); setFile(null); void load();
  };

  const resolve = async (id: string) => { await supabase.from("support_tickets").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id); void load(); };
  const openShot = async (path: string) => { const s = await supabase.storage.from("support-screenshots").createSignedUrl(path, 120); if (s.data) window.open(s.data.signedUrl, "_blank"); };

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-accent/30 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary-foreground/15 backdrop-blur"><LifeBuoy className="size-8 animate-[spin_6s_linear_infinite]" aria-hidden /></div>
          <div><h1 className="text-2xl font-bold">Technical Support</h1><p className="text-sm opacity-90">Tell us what is wrong — the website developer gets it by email and in the app.</p></div>
        </div>
      </section>

      {canRaise && <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">1. What kind of help do you need?</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TYPES.map(({ label, icon: Icon, hint }) => {
            const on = type === label;
            return <button type="button" key={label} onClick={() => setType(label)} aria-pressed={on}
              className={`group rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${on ? "border-accent bg-accent/10 ring-2 ring-accent" : "border-border bg-background"}`}>
              <Icon className={`size-6 ${on ? "text-accent" : "text-primary"}`} aria-hidden />
              <p className="mt-2 text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{hint}</p>
            </button>;
          })}
        </div>
        <h2 className="mt-6 font-semibold">2. Describe the problem</h2>
        <Textarea className="mt-2 min-h-28" maxLength={2000} placeholder="Example: When I click Save on the Payments page, nothing happens." value={text} onChange={(e) => setText(e.target.value)} />
        <h2 className="mt-6 font-semibold">3. Add a screenshot (optional)</h2>
        {!preview ? <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:bg-primary/10"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
          <ImagePlus className="size-8 text-primary" aria-hidden /><span className="font-medium">Tap to choose a picture</span><span className="text-xs text-muted-foreground">or drag it here · JPG, PNG, WEBP up to 5 MB</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label> : <div className="relative mt-2 inline-block"><img src={preview} alt="Screenshot preview" className="max-h-56 rounded-xl border border-border" /><Button size="icon" variant="secondary" className="absolute right-2 top-2" aria-label="Remove picture" onClick={() => setFile(null)}><X /></Button></div>}
        {msg && <p className={`mt-4 flex items-center gap-2 text-sm ${msg.ok ? "text-accent" : "text-destructive"}`}>{msg.ok && <CheckCircle2 className="size-4" aria-hidden />}{msg.text}</p>}
        <Button className="mt-5 w-full sm:w-auto" size="lg" disabled={busy} onClick={submit}><Send className="size-4" aria-hidden />{busy ? "Sending…" : "Send to developer"}</Button>
      </section>}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{isAdmin ? "All support requests" : "My requests"}</h2>
        {!tickets.length && <p className="mt-2 text-sm text-muted-foreground">No requests yet.</p>}
        <ul className="mt-3 space-y-3">{tickets.map((t) => <li key={t.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{t.category}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.status === "resolved" ? "bg-accent/15 text-accent" : "bg-destructive/10 text-destructive"}`}>{t.status === "resolved" ? "Resolved" : "Open"}</span></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{t.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("en-IN")}{isAdmin && t.created_email ? ` · ${t.created_email}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">{t.image_path && <Button size="sm" variant="outline" onClick={() => openShot(t.image_path!)}>View screenshot</Button>}
            {isAdmin && t.status !== "resolved" && <Button size="sm" onClick={() => resolve(t.id)}>Mark resolved</Button>}</div>
        </li>)}</ul>
      </section>
    </main>
  );
}
