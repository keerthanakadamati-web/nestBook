import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eyebrow, Notice, Panel, PrimaryButton } from "@/components/app-ui";
import { PasswordField } from "@/components/password-field";
import { supabase } from "@/integrations/supabase/client";
import { passwordConfirmationError } from "@/lib/account-actions";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Reset password — NestInLedger" }, { name: "description", content: "Securely reset your NestInLedger account password." },
    { property: "og:title", content: "Reset password — NestInLedger" }, { property: "og:description", content: "Choose a new password for your NestInLedger account." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: ResetPassword,
});
function ResetPassword() {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const recovery = hash.get("type") === "recovery";
    const accessToken = hash.get("access_token"), refreshToken = hash.get("refresh_token");
    async function validate() {
      // The Cloud client consumes recovery tokens on initialization. Never accept
      // an ordinary signed-in session as proof of a recovery link.
      if (!recovery || !accessToken || !refreshToken) { setError("Open the password-reset link from your email. It may have expired; request a new link if needed."); return; }
      const session = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      const result = session.error ? { data: { user: null }, error: session.error } : await supabase.auth.getUser();
      if (!active) return;
      if (result.error || !result.data.user) setError("This reset link is invalid or expired. Please request a new one.");
      else setReady(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    void validate();
    return () => { active = false; };
  }, []);
  return <main className="flex min-h-screen items-center justify-center px-4 py-12"><div className="w-full max-w-md"><Eyebrow>NestInLedger</Eyebrow><h1 className="mt-1 font-display text-3xl font-bold">Reset password</h1><Panel className="mt-6"><form className="space-y-4" onSubmit={async (e) => {
    e.preventDefault(); setError("");
    const mismatch = passwordConfirmationError(password, confirmation); if (mismatch) { setError(mismatch); return; }
    if (!ready || done) return;
    setBusy(true);
    try { const result = await supabase.auth.updateUser({ password }); if (result.error) { setError(result.error.message); return; } setDone(true); setPassword(""); setConfirmation(""); await supabase.auth.signOut(); }
    catch { setError("Could not reset your password. Please try again."); } finally { setBusy(false); }
  }}>{!done && <><PasswordField label="New password" autoComplete="new-password" value={password} required disabled={!ready || busy} onChange={(e) => setPassword(e.target.value)} /><PasswordField label="Confirm password" autoComplete="new-password" value={confirmation} required disabled={!ready || busy} onChange={(e) => setConfirmation(e.target.value)} /></>}{error && <Notice tone="error">{error}</Notice>}{done ? <Notice tone="ok">Password updated. Sign in with your new password.</Notice> : <PrimaryButton type="submit" className="w-full" disabled={!ready || busy}>{busy ? "Please wait…" : "Save new password"}</PrimaryButton>}<Link to="/auth" className="block text-center text-sm text-primary">Back to Login</Link></form></Panel></div></main>;
}