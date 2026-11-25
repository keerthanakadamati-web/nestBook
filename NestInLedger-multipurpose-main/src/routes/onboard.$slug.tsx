import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Field, Notice, Panel } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { validateRegistration, type Registration } from "@/lib/flat-registration";

export const Route = createFileRoute("/onboard/$slug")({
  head: () => ({
    meta: [
      { title: "Register your flat — NestInLedger" },
      { name: "description", content: "Share your flat details with your apartment committee." },
      { property: "og:title", content: "Register your flat — NestInLedger" },
      { property: "og:description", content: "Fill your flat, parking and vehicle details for your society portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboard,
});

const empty: Registration = { flat_number: "", floor: "", owner_name: "", mobile: "", owner_email: "", occupancy: "owner", tenant_name: "", tenant_phone: "", parking_slot: "", vehicle_type: "none", vehicle_numbers: "", house_tax_number: "", aadhaar_number: "" };
const selectClass = "mt-1.5 w-full rounded-lg bg-card px-3 py-2.5 ring-1 ring-input";

function Onboard() {
  const { slug } = Route.useParams();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [v, setV] = useState<Registration>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { void supabase.rpc("society_public_name", { _slug: slug }).then(({ data }) => setName(data ?? null)); }, [slug]);
  const set = (k: keyof Registration) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateRegistration(v);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    const r = await supabase.rpc("submit_flat_registration", { _slug: slug, _v: v });
    setBusy(false);
    if (r.error) setError(r.error.message.includes("Too many") ? "Too many submissions right now. Please try later." : "Could not send. Please check your details and try again.");
    else setDone(true);
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <BrandLogo />
      {name === undefined ? <p className="text-muted-foreground">Loading…</p> : name === null ? <Notice tone="error">This apartment link is not valid. Please ask your committee for the correct link.</Notice> : done ? (
        <Panel className="text-center"><CheckCircle2 className="mx-auto size-12 text-sage-deep" /><h1 className="mt-3 font-display text-2xl font-semibold">Thank you!</h1><p className="mt-2 text-muted-foreground">Your details were sent to the {name} committee.</p><Button className="mt-5" variant="outline" onClick={() => { setV(empty); setDone(false); }}>Add another flat</Button></Panel>
      ) : (
        <Panel>
          <h1 className="font-display text-2xl font-semibold">Register your flat</h1>
          <p className="mt-1 text-sm text-muted-foreground">{name} · Only your committee can see these details.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3"><Field label="Flat number *" value={v.flat_number} onChange={set("flat_number")} maxLength={20} /><Field label="Floor" value={v.floor} onChange={set("floor")} maxLength={20} /></div>
            <Field label="Owner name *" value={v.owner_name} onChange={set("owner_name")} maxLength={100} />
            <Field label="Owner mobile *" inputMode="numeric" value={v.mobile} onChange={set("mobile")} maxLength={10} hint="Your mobile number will be your first password." />
            <Field label="Owner email *" type="email" value={v.owner_email} onChange={set("owner_email")} maxLength={200} hint="You will log in with this email." />
            <label className="block"><span className="text-sm font-medium text-muted-foreground">Who lives in the flat?</span>
              <select className={selectClass} value={v.occupancy} onChange={set("occupancy")}><option value="owner">Owner lives here</option><option value="rented">Rented to tenant</option></select></label>
            {v.occupancy === "rented" && <div className="grid grid-cols-2 gap-3"><Field label="Tenant name *" value={v.tenant_name} onChange={set("tenant_name")} maxLength={100} /><Field label="Tenant mobile" inputMode="numeric" value={v.tenant_phone} onChange={set("tenant_phone")} maxLength={10} /></div>}
            <div className="grid grid-cols-2 gap-3"><Field label="Parking slot" value={v.parking_slot} onChange={set("parking_slot")} maxLength={30} />
              <label className="block"><span className="text-sm font-medium text-muted-foreground">Vehicle</span>
                <select className={selectClass} value={v.vehicle_type} onChange={set("vehicle_type")}><option value="none">None</option><option value="2-wheeler">2-wheeler</option><option value="4-wheeler">4-wheeler</option><option value="both">Both</option></select></label></div>
            {v.vehicle_type !== "none" && <Field label="Vehicle numbers" placeholder="e.g. AP 31 AB 1234" value={v.vehicle_numbers} onChange={set("vehicle_numbers")} maxLength={120} />}
            <Field label="House tax assessment number (optional)" value={v.house_tax_number} onChange={set("house_tax_number")} maxLength={40} />
            <Field label="Aadhaar number *" inputMode="numeric" value={v.aadhaar_number} onChange={set("aadhaar_number")} maxLength={14} hint="12 digits. Kept private and shown only as XXXX XXXX 1234." />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send details"}</Button>
          </form>
        </Panel>
      )}
    </main>
  );
}
