import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { isCommittee } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type Item = { id: string; title: string; detail: string; at: string; to: string };

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function loadItems(role: Parameters<typeof isCommittee>[0]): Promise<Item[]> {
  const items: Item[] = [];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: ann } = await supabase.from("announcements").select("id,title,created_at").eq("published", true).gte("created_at", since).order("created_at", { ascending: false }).limit(10);
  ann?.forEach((a) => items.push({ id: `ann-${a.id}`, title: "New announcement", detail: a.title, at: a.created_at, to: "/announcements" }));

  const { data: polls } = await supabase.from("society_polls").select("id,title,created_at,expires_at").eq("status", "active").gte("created_at", since).limit(10);
  polls?.forEach((p) => { if (!p.expires_at || new Date(p.expires_at) > new Date()) items.push({ id: `poll-${p.id}`, title: "New poll — please vote", detail: p.title, at: p.created_at, to: "/polls" }); });

  const { data: cmp } = await supabase.from("complaints").select("id,title,status,updated_at").gte("updated_at", since).order("updated_at", { ascending: false }).limit(10);
  cmp?.forEach((c) => items.push({ id: `cmp-${c.id}-${c.updated_at}`, title: `Complaint: ${c.status.replace(/_/g, " ")}`, detail: c.title, at: c.updated_at, to: "/complaints" }));

  if (role === "admin") {
    const { data: sup } = await supabase.from("support_tickets").select("id,category,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(10);
    sup?.forEach((t) => items.push({ id: `sup-${t.id}`, title: "New technical support request", detail: t.category, at: t.created_at, to: "/support" }));
  }
  if (isCommittee(role)) {
    const { data: props } = await supabase.from("change_proposals").select("id,module,action,submitted_at").eq("status", "pending").order("submitted_at", { ascending: false }).limit(10);
    props?.forEach((p) => items.push({ id: `prop-${p.id}`, title: "Waiting for approval", detail: `${p.action} in ${p.module.replace(/_/g, " ")}`, at: p.submitted_at, to: "/approvals" }));
    const { data: pend } = await supabase.from("payments").select("id,amount,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10);
    pend?.forEach((p) => items.push({ id: `pay-${p.id}`, title: "Payment to confirm", detail: `${rupees(Number(p.amount))} waiting for Treasurer`, at: p.created_at, to: "/payments" }));
  } else {
    const { data: pays } = await supabase.from("payments").select("id,amount,receipt_no,created_at").eq("status", "confirmed").gte("created_at", since).order("created_at", { ascending: false }).limit(10);
    pays?.forEach((p) => items.push({ id: `pay-${p.id}`, title: "Payment received", detail: `${rupees(Number(p.amount))} · Receipt ${p.receipt_no}`, at: p.created_at, to: "/my-payments" }));
    const { data: acc } = await supabase.from("flat_accounts").select("id,flat_number,outstanding");
    const today = new Date().toISOString().slice(0, 7);
    acc?.forEach((f) => { if (Number(f.outstanding) > 0) items.push({ id: `due-${f.id}-${today}-${f.outstanding}`, title: "Maintenance due", detail: `Flat ${f.flat_number}: ${rupees(Number(f.outstanding))} to pay`, at: new Date().toISOString(), to: "/my-maintenance" }); });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
}

export function NotificationBell({ className }: { className?: string }) {
  const { role, userId, loading } = useSessionRole();
  const [items, setItems] = useState<Item[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const key = `nl-read-${userId}`;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  useEffect(() => {
    if (loading || !userId) return;
    try { setRead(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { setRead([]); }
    let active = true;
    const refresh = async () => { const list = await loadItems(role); if (active) setItems(list); };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [loading, userId, role, key]);

  const save = (ids: string[]) => { const next = Array.from(new Set([...read, ...ids])).slice(-300); setRead(next); localStorage.setItem(key, JSON.stringify(next)); };
  const unread = items.filter((i) => !read.includes(i.id)).length;
  if (!userId) return null;

  return (
    <div ref={box} className="relative">
        <Button aria-expanded={open} onClick={() => setOpen((v) => !v)} variant="ghost" size="icon" className={`relative ${className ?? ""}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      {open && <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={() => save(items.map((i) => i.id))}><CheckCheck className="mr-1 size-4" />Mark all read</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>}
          {items.map((i) => {
            const isNew = !read.includes(i.id);
            return (
              <Link key={i.id} to={i.to} onClick={() => { save([i.id]); setOpen(false); }} className={`block border-b border-border px-4 py-3 text-sm hover:bg-muted ${isNew ? "bg-accent/40" : ""}`}>
                <p className="flex items-center gap-2 font-medium">{isNew && <span className="size-2 rounded-full bg-primary" />}{i.title}</p>
                <p className="text-muted-foreground">{i.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(i.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </Link>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
