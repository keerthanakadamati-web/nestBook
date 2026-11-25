import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Eyebrow, Panel } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";

type Society = { slug: string; code: string; name: string; city: string | null };

export const Route = createFileRoute("/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Sign in — ${params.slug} · NestInLedger` },
      { name: "description", content: "Sign in to your apartment's maintenance and society account." },
      { property: "og:title", content: `${params.slug} · NestInLedger` },
      { property: "og:description", content: "Your apartment's maintenance dues, payments and notices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SocietyEntry,
});

function SocietyEntry() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<"loading" | "missing" | Society>("loading");

  useEffect(() => {
    let active = true;
    supabase.rpc("society_public_info", { _slug: slug }).then(({ data }) => {
      if (!active) return;
      const row = data?.[0];
      if (!row) return setState("missing");
      localStorage.setItem("nil.society", row.slug);
      setState(row);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Panel className="w-full max-w-md px-7 py-10 text-center md:px-12">
        {state === "loading" ? (
          <p className="text-muted-foreground">Finding your apartment…</p>
        ) : state === "missing" ? (
          <>
            <h1 className="font-display text-2xl font-bold">Apartment not found</h1>
            <p className="mt-3 text-muted-foreground">Please check the link you were given.</p>
            <Link to="/" className="mt-6 inline-block font-semibold text-primary underline">
              Go to home page
            </Link>
          </>
        ) : (
          <>
            <Eyebrow>Welcome home</Eyebrow>
            <Building2 className="mx-auto mt-5 size-10 text-primary" aria-hidden="true" />
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{state.name}</h1>
            {state.city ? <p className="mt-1 text-muted-foreground">{state.city}</p> : null}
            <Link
              to="/auth"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-pill hover:bg-primary/90"
            >
              Sign in <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Each resident sees only their own flat.
            </p>
            <p className="mt-6 text-xs text-muted-foreground">
              Managed via <BrandLogo markClassName="size-4" />
            </p>
          </>
        )}
      </Panel>
    </main>
  );
}
