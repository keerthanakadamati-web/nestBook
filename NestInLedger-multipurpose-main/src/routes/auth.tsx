import { BrandLogo } from "@/components/brand-logo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Mail } from "lucide-react";

import { Notice, PrimaryButton, QuietButton } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { isCommittee, primaryRole } from "@/lib/permissions";
import { PasswordField } from "@/components/password-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { parsePilotTerms, signInWithPilotAcceptance } from "@/lib/pilot-terms";
import { clearSessionCache } from "@/lib/session";

const publicPilotTerms = queryOptions({
  queryKey: ["public-pilot-terms"],
  queryFn: async () => {
    const result = await supabase.rpc("pilot_terms_document");
    if (result.error) throw new Error("Could not load the pilot terms. Please refresh and try again.");
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error("Could not load the pilot terms.");
    return parsePilotTerms({ ...result.data, accepted_at: null });
  },
  staleTime: 60_000,
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(publicPilotTerms),
  head: () => ({
    meta: [
      { title: "Sign in — NestInLedger" },
      {
        name: "description",
        content: "Sign in to see your flat's maintenance dues or to open the committee dashboard.",
      },
      { property: "og:title", content: "Sign in — NestInLedger" },
      { property: "og:description", content: "Sign in to your apartment maintenance accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

/* Subtle apartment-building illustration drawn with inline SVG (no image files). */
function SkylineIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full text-primary/10 sm:h-72"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="2.5">
        {/* left tower */}
        <rect x="60" y="90" width="140" height="230" rx="6" />
        <path d="M100 90v-30h60v30" />
        <rect x="85" y="120" width="24" height="24" rx="3" />
        <rect x="151" y="120" width="24" height="24" rx="3" />
        <rect x="85" y="170" width="24" height="24" rx="3" />
        <rect x="151" y="170" width="24" height="24" rx="3" />
        <rect x="85" y="220" width="24" height="24" rx="3" />
        <rect x="151" y="220" width="24" height="24" rx="3" />
        {/* mid tower */}
        <rect x="620" y="40" width="200" height="280" rx="6" />
        <path d="M660 40v-26h120v26" />
        <rect x="650" y="80" width="30" height="30" rx="3" />
        <rect x="705" y="80" width="30" height="30" rx="3" />
        <rect x="760" y="80" width="30" height="30" rx="3" />
        <rect x="650" y="140" width="30" height="30" rx="3" />
        <rect x="705" y="140" width="30" height="30" rx="3" />
        <rect x="760" y="140" width="30" height="30" rx="3" />
        <rect x="650" y="200" width="30" height="30" rx="3" />
        <rect x="760" y="200" width="30" height="30" rx="3" />
        {/* right tower */}
        <rect x="1240" y="120" width="150" height="200" rx="6" />
        <rect x="1268" y="150" width="24" height="24" rx="3" />
        <rect x="1338" y="150" width="24" height="24" rx="3" />
        <rect x="1268" y="205" width="24" height="24" rx="3" />
        <rect x="1338" y="205" width="24" height="24" rx="3" />
        <path d="M1290 120v-24h50v24" />
      </g>
      <path
        d="M0 320h1440"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const { data: terms } = useSuspenseQuery(publicPilotTerms);
  const queryClient = useQueryClient();

  async function routeByRole(userId: string) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = isCommittee(primaryRole(roles ?? []));
    navigate({ to: isAdmin ? "/dashboard" : "/my-flat", replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      if (mode === "forgot") {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error) throw result.error;
        setOk("If this email is registered, you’ll receive a password-reset link. Please check your inbox and spam folder.");
        return;
      }

      const user = await signInWithPilotAcceptance({
        acknowledged,
        version: terms.version,
        signIn: async () => {
          const result = await supabase.auth.signInWithPassword({ email, password });
          if (result.error) throw result.error;
          return result.data.user;
        },
        accept: async version => {
          const result = await supabase.rpc("accept_pilot_terms", { _version: version, _acknowledged: true });
          if (result.error || !result.data) throw result.error ?? new Error("Acceptance could not be saved. Please try again.");
        },
        signOut: async () => {
          await queryClient.cancelQueries();
          queryClient.clear();
          clearSessionCache();
          await supabase.auth.signOut();
        },
      });
      await routeByRole(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <SkylineIllustration />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display text-3xl"><BrandLogo markClassName="size-9" /></h1>
          <p className="mt-2 text-sm font-medium italic text-muted-foreground">
            Tradition of trust. Tech of today.
          </p>
        </div>

        <div className="mt-7 rounded-lg bg-card p-6 shadow-card ring-1 ring-border sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-tight">
            {mode === "forgot" ? "Forgot password" : "Sign in to your account"}
          </h2>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Email</span>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  required
                  aria-label="Email"
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-card py-3 pl-11 pr-4 text-base text-foreground ring-1 ring-input outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>
            </label>
            {mode === "signin" && <PasswordField label="Password" value={password} autoComplete="current-password" required onChange={(e) => setPassword(e.target.value)} />}
            {mode === "signin" && (
              <div className="flex justify-end">
                <Button variant="link"
                  type="button"
                  onClick={() => { setMode("forgot"); setPassword(""); setError(""); setOk(""); }}
                  className="px-0 text-sm font-semibold"
                >
                  Forgot password?
                </Button>
              </div>
            )}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {ok ? <Notice tone="ok">{ok}</Notice> : null}
            {mode === "signin" && <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-primary">Pilot testing acknowledgment</p>
              <details className="rounded-lg border border-border bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium">Read Terms & Conditions</summary>
                <div tabIndex={0} aria-label="Pilot terms and conditions" className="mt-3 max-h-64 overflow-y-auto text-sm leading-6 text-muted-foreground">
                  <p className="mb-3 font-semibold text-foreground">{terms.title} · {terms.version}</p>
                  {terms.text.split("\n\n").map((paragraph, index) => <p key={index} className="mb-4 whitespace-pre-line last:mb-0">{paragraph}</p>)}
                </div>
              </details>
              <label htmlFor="pre-login-terms" className="flex cursor-pointer items-start gap-3 text-sm leading-6">
                <Checkbox id="pre-login-terms" className="mt-1 size-5 shrink-0" checked={acknowledged} disabled={busy} onCheckedChange={value => setAcknowledged(value === true)} />
                <span>I have read, understood and accept the Terms & Conditions, and acknowledge that this application is in pilot mode for testing.</span>
              </label>
            </div>}
            <PrimaryButton type="submit" className="w-full" disabled={busy || (mode === "signin" && !acknowledged)}>
              {busy ? "Please wait…" : mode === "forgot" ? "Send reset email" : "Sign in"}
            </PrimaryButton>
          </form>
          {mode === "forgot" && (
            <div className="mt-5">
              <QuietButton onClick={() => { setMode("signin"); setError(""); setOk(""); }}>
                Back to Login
              </QuietButton>
            </div>
          )}
          {mode === "signin" && (
            <p className="mt-5 text-sm text-muted-foreground">
              Residents: use the email and password given by the committee.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
