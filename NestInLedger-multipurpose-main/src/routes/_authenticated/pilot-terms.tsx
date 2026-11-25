import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/app-ui";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";
import { clearSessionCache, loadSessionInfo } from "@/lib/session";
import { isCommittee } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/pilot-terms")({
  head: () => ({ meta: [
    { title: "Pilot Terms & Acceptance — NestInLedger" },
    { name: "description", content: "Review and acknowledge NestInLedger pilot testing terms before using your society account." },
    { property: "og:title", content: "Pilot Terms & Acceptance — NestInLedger" },
    { property: "og:description", content: "Pilot evaluation terms, privacy commitment and user acknowledgment." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PilotAgreement,
});

function PilotAgreement() {
  const { pilotTerms } = Route.useRouteContext();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate(); const router = useRouter(); const queryClient = useQueryClient();
  async function accept() {
    if (!checked || busy) return;
    setBusy(true); setError("");
    try {
      const result = await supabase.rpc("accept_pilot_terms", { _version: pilotTerms.version, _acknowledged: checked });
      if (result.error || !result.data) throw result.error ?? new Error("Acceptance could not be saved. Please try again.");
      await router.invalidate();
      const info = await loadSessionInfo();
      await navigate({ to: isCommittee(info.role) ? "/dashboard" : "/my-flat", replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : "Acceptance could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    await queryClient.cancelQueries(); queryClient.clear(); clearSessionCache();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-2xl">
      <BrandLogo className="text-2xl" />
      <header className="mt-8 border-b border-border pb-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-5" />Pilot testing · {pilotTerms.version}</p>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Before you continue</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">This application is in pilot mode for testing and evaluation. Please read and accept the terms to use your account.</p>
      </header>
      <h2 className="mt-5 text-lg font-semibold">{pilotTerms.title}</h2>
      <div tabIndex={0} aria-label="Pilot terms and conditions" className="mt-4 max-h-[38vh] overflow-y-auto rounded-lg border border-border bg-card p-4 text-sm leading-6 sm:p-5">
        {pilotTerms.text.split("\n\n").map((paragraph, index) => <p key={index} className="mb-5 whitespace-pre-line last:mb-0">{paragraph}</p>)}
      </div>
      <label htmlFor="pilot-acknowledged" className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-6">
        <Checkbox id="pilot-acknowledged" className="mt-1 size-5" checked={checked} disabled={busy} onCheckedChange={value => setChecked(value === true)} />
        <span>I have read, understood and accept the Terms & Conditions, and acknowledge that I am using this application for pilot testing.</span>
      </label>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button className="min-h-11 flex-1" disabled={!checked || busy} onClick={accept}>{busy ? "Please wait…" : "Accept & Continue"}</Button>
        <Button className="min-h-11" variant="outline" disabled={busy} onClick={leave}><LogOut className="size-4" />Sign out</Button>
      </div>
    </div>
  </main>;
}