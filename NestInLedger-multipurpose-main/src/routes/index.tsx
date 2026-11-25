import { BrandLogo } from "@/components/brand-logo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Eyebrow, Panel } from "@/components/app-ui";
import { isCommittee } from "@/lib/permissions";
import { loadSessionInfo } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NestInLedger — Maintenance made simple" },
      {
        name: "description",
        content:
          "Residents can check their maintenance dues and pay online. The committee records cash payments and issues receipts.",
      },
      { property: "og:title", content: "NestInLedger" },
      {
        property: "og:description",
        content: "Check your flat's maintenance dues, pay online, and download receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    loadSessionInfo().then((info) => {
      if (!active || !info.userId) return;
      navigate({ to: isCommittee(info.role) ? "/dashboard" : "/my-flat", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 md:px-6 md:py-20">
      <Panel className="w-full max-w-md px-7 py-10 text-center md:px-12 md:py-14">
        <Eyebrow>Welcome home</Eyebrow>

        <div className="mt-5 flex items-center justify-center gap-2.5">
          <h1 className="font-display text-2xl md:text-3xl">
            <BrandLogo markClassName="size-8" />
          </h1>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Society accounts
        </p>

        <h2 className="mt-9 text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
          Your community, managed simply.
        </h2>
        <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
          See your flat's maintenance dues, pay by UPI, and download receipts — monthly
          maintenance is ₹1,500, due on the 1st.
        </p>

        <Link
          to="/auth"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-pill transition hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 sm:w-auto"
        >
          Sign in
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>

        <ApartmentFinder />

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Each resident sees only their own flat.
        </p>
      </Panel>
    </main>
  );
}

function ApartmentFinder() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <form
      className="mt-6 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const slug = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (slug) navigate({ to: "/$slug", params: { slug } });
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Apartment code, e.g. labanya"
        aria-label="Apartment code"
        className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary">
        Find
      </button>
    </form>
  );
}
