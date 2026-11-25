import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { daysLeft } from "@/lib/license";

/** Blocks everyone except Admin once the yearly website licence has expired; warns 30 days before. */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { role } = useSessionRole();
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("society_license").select("expires_on").eq("id", true).maybeSingle().then(({ data }) => setExpires(data?.expires_on ?? null));
  }, []);
  if (!expires) return <>{children}</>;
  const left = daysLeft(expires);
  const isAdmin = role === "admin";
  if (left < 0 && role && !isAdmin) {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm"><Lock className="mx-auto size-10 text-destructive" /><h1 className="mt-4 text-2xl font-bold">Website subscription expired</h1><p className="mt-3 text-muted-foreground">The yearly plan ended on {expires}. Your data is safe. Please contact the Admin to renew.</p></div></main>;
  }
  const banner = left < 0 ? `Subscription expired on ${expires}. Others are blocked until you renew.` : left <= 30 ? `Website subscription ends in ${left} day${left === 1 ? "" : "s"} (${expires}).${isAdmin ? "" : " Please contact the Admin to renew."}` : "";
  return <>{banner && role ? <div className="border-b border-border bg-destructive/10 px-4 py-2 text-center text-sm">{banner}{isAdmin && <> <Link to="/license" className="font-semibold underline">Renew now</Link></>}</div> : null}{children}</>;
}
