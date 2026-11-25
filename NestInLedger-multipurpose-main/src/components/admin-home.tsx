import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, LifeBuoy, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { SocietiesPage } from "@/components/societies-panel";

export function AdminHome() {
  const { name } = useSessionRole();
  const [sum, setSum] = useState<{ societies: number; open: number } | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc("admin_platform_summary").then((r) => {
      const row = r.data?.[0];
      setSum({ societies: Number(row?.societies ?? 0), open: Number(row?.open_tickets ?? 0) });
    });
    void supabase.from("society_license").select("expires_on").eq("id", true).maybeSingle().then((r) => setExpires(r.data?.expires_on ?? null));
  }, []);
  const days = expires ? Math.ceil((new Date(expires).getTime() - Date.now()) / 86400000) : null;
  const cards = [
    { label: "Societies", value: sum ? String(sum.societies) : "…", note: "Apartments using the app", icon: Building2, to: "/societies" as const },
    { label: "Technical Support", value: sum ? String(sum.open) : "…", note: "Open requests", icon: LifeBuoy, to: "/support" as const },
    { label: "Website Renewal", value: days === null ? "…" : days < 0 ? "Expired" : `${days} days`, note: expires ? `Valid till ${expires}` : "Renewal date", icon: BadgeCheck, to: "/license" as const },
  ];
  return <main className="mx-auto max-w-6xl px-4 py-8 md:px-10">
    <p className="text-sm text-muted-foreground">Admin home</p>
    <h1 className="font-display text-2xl font-semibold sm:text-3xl">Welcome, {name ?? "Admin"}</h1>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {cards.map(({ label, value, note, icon: Icon, to }) => <Link key={label} to={to} className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div>
        <p className="mt-2 text-3xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{note}</p>
      </Link>)}
    </div>
    <SocietiesPage embedded />
  </main>;
}
