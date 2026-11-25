import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { saveAdministrativeChange } from "@/lib/approval";
import { type SocietyConfiguration } from "@/lib/configuration";
import { rateForMonth, type MaintenanceRate } from "@/lib/billing-config";
import { monthName, rupees, shortDate } from "@/lib/format";
import { reminderServiceStatus } from "@/lib/settings.functions";

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(2026, i, 1).toLocaleString("en-IN", { month: "long" }) }));
export function MaintenanceSettings({ settings, rates, writable, onSaved }: { settings: SocietyConfiguration; rates: MaintenanceRate[]; writable: boolean; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [service, setService] = useState<Awaited<ReturnType<typeof reminderServiceStatus>> | null>(null);
  const status = useServerFn(reminderServiceStatus);
  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => { status().then(setService).catch(() => setError("Could not check the reminder service.")); }, [status]);
  const currentMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).slice(0, 7);
  const current = rateForMonth(rates, currentMonth);
  const next = new Date(); next.setMonth(next.getMonth() + 1, 1);
  const minMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const change = <K extends keyof SocietyConfiguration>(key: K, value: SocietyConfiguration[K]) => setDraft((d) => ({ ...d, [key]: value }));
  async function save(section: "maintenance" | "reminder") {
    setError(""); setMessage("");
    const keys: (keyof SocietyConfiguration)[] = section === "maintenance" ? ["monthly_amount", "effective_month", "due_day", "fy_start_month"] : ["reminders_enabled", "reminder_start_day", "reminder_time", "reminder_timezone", "payment_notifications"];
    const values: Partial<SocietyConfiguration> = Object.fromEntries(keys.filter((key) => draft[key] !== settings[key]).map((key) => [key, draft[key]]));
    if (!Object.keys(values).length) { setMessage("No changes to save."); return; }
    if (section === "maintenance") {
      if (!Number.isFinite(draft.monthly_amount) || draft.monthly_amount <= 0 || draft.monthly_amount > 100000000) { setError("Enter a positive maintenance amount."); return; }
      if (draft.effective_month.slice(0, 7) < minMonth) { setError("Choose a future effective month."); return; }
      // Always include the chosen effective month when proposing a billing change.
      values.effective_month = draft.effective_month;
    }
    setBusy(true);
    try {
      const result = await saveAdministrativeChange({ module: "society_settings", action: "update", key: "true", values }, () => supabase.from("society_settings").update(values).eq("id", true));
      if (result.error) { setError(result.error.message); return; }
      await onSaved(); setMessage(result.pending ? "Submitted for President approval. Saved settings remain unchanged until approval." : "Settings saved.");
    } catch { setError("Could not save these settings. Please try again."); }
    finally { setBusy(false); }
  }
  function cancel() { setDraft(settings); setMessage(""); setError(""); }
  return <>
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Maintenance configuration</h2>
      <p className="mt-3 text-sm text-muted-foreground">Currently applicable: {rupees(current.monthly_amount)} per flat · Due day {current.due_day} · Financial year starts in {months.find((m) => m.value === current.fy_start_month)?.name}</p>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save("maintenance"); }}>
        <Field label="Monthly maintenance per flat (₹)" type="number" min="0.01" max="100000000" step="0.01" required disabled={!writable || busy} value={draft.monthly_amount} onChange={(e) => change("monthly_amount", Number(e.target.value))} />
        <Field label="Effective month" type="month" min={minMonth} required disabled={!writable || busy} value={draft.effective_month.slice(0, 7)} onChange={(e) => change("effective_month", `${e.target.value}-01`)} />
        <Field label="Monthly due day" type="number" min="1" max="31" step="1" required disabled={!writable || busy} value={draft.due_day} onChange={(e) => change("due_day", Number(e.target.value))} />
        <label className="block text-sm font-medium text-muted-foreground">Financial year start month<select aria-label="Financial year start month" disabled={!writable || busy} className="mt-1.5 w-full rounded-xl border border-input bg-muted px-4 py-3 text-foreground" value={draft.fy_start_month} onChange={(e) => change("fy_start_month", Number(e.target.value))}>{months.map((m) => <option key={m.value} value={m.value}>{m.name}</option>)}</select></label>
        {writable && <div className="flex gap-3 md:col-span-2"><Button disabled={busy} type="submit">Save maintenance</Button><Button disabled={busy} variant="outline" type="button" onClick={cancel}>Cancel</Button></div>}
      </form>
      <h3 className="mt-5 font-semibold">Approved maintenance rates</h3><ul className="mt-2 divide-y divide-border text-sm">{rates.map((r) => <li key={r.effective_month} className="flex flex-wrap justify-between gap-2 py-2"><span>{r.effective_month === "1900-01-01" ? "Historical rate" : `From ${monthName(r.effective_month.slice(0, 7))}`}</span><span>{rupees(r.monthly_amount)} · Due day {r.due_day}</span></li>)}</ul>
    </section>
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Maintenance reminder settings</h2>
      <p className="mt-3 text-sm text-muted-foreground">Saved: {settings.reminders_enabled ? "Enabled" : "Disabled"} · From day {settings.reminder_start_day} · {settings.reminder_time.slice(0, 5)} {settings.reminder_timezone} · Daily · Gmail</p>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save("reminder"); }}>
        <label className="flex items-center justify-between gap-3">Automatic reminders<Switch aria-label="Automatic reminders" checked={draft.reminders_enabled} disabled={!writable || busy} onCheckedChange={(v) => change("reminders_enabled", v)} /></label>
        <label className="flex items-center justify-between gap-3">Payment confirmation emails<Switch aria-label="Payment confirmation emails" checked={draft.payment_notifications} disabled={!writable || busy} onCheckedChange={(v) => change("payment_notifications", v)} /></label>
        <Field label="Reminder start day" type="number" min="1" max="31" step="1" required disabled={!writable || busy} value={draft.reminder_start_day} onChange={(e) => change("reminder_start_day", Number(e.target.value))} />
        <Field label="Reminder time" type="time" required disabled={!writable || busy} value={draft.reminder_time.slice(0, 5)} onChange={(e) => change("reminder_time", `${e.target.value}:00`)} />
        <Field label="Time zone" required maxLength={100} disabled={!writable || busy} value={draft.reminder_timezone} onChange={(e) => change("reminder_timezone", e.target.value.trim())} />
        <div className="text-sm"><p>Frequency: Daily while dues remain unpaid</p><p className="mt-2">Delivery: Existing Gmail connection</p></div>
        {writable && <div className="flex gap-3 md:col-span-2"><Button disabled={busy} type="submit">Save reminders</Button><Button disabled={busy} variant="outline" type="button" onClick={cancel}>Cancel</Button></div>}
      </form>
      {service && !service.configured && <div className="mt-4"><Notice tone="error">Gmail is not configured. Reminders cannot be sent.</Notice></div>}
      {settings.reminder_timezone !== "Asia/Kolkata" && <div className="mt-4"><Notice tone="error">Time zones with seasonal clock changes need their saved time confirmed again after a clock change. Asia/Kolkata has no seasonal changes.</Notice></div>}
      <h3 className="mt-5 font-semibold">Last reminder execution</h3><p className="mt-2 text-sm">{service?.lastRun ? `${shortDate(service.lastRun.run_date)} · ${service.lastRun.status} · Gmail accepted ${service.lastRun.sent} · Failed ${service.lastRun.failed}` : "No execution status recorded yet."}</p>
      {service?.lastRun?.error && <p className="mt-2 text-sm text-destructive">{service.lastRun.error}</p>}
    </section>
    {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}{message && <div className="mt-4"><Notice tone="ok">{message}</Notice></div>}
  </>;
}