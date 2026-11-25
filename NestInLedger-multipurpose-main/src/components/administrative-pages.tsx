import { openPaymentProof } from "@/lib/payment-submission";
import { PageLoader } from "@/components/page-loader";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field, Modal, Notice, QuietButton, StatusPill, Tile } from "@/components/app-ui";
import { Account, Payment, CashForm, FlatForm, LoginForm, SettingsForm } from "@/components/committee-console";
import { supabase } from "@/integrations/supabase/client";
import { canConfirmPayments, canSubmitChanges, roleLabel } from "@/lib/permissions";
import { useSessionRole } from "@/lib/session";
import { ProfileNameForm } from "@/components/profile-name-form";
import { PushSettings } from "@/components/push-settings";
import { saveAdministrativeChange } from "@/lib/approval";
import { fyLabel, fyStartOf, monthName, rupees, shortDate } from "@/lib/format";
import { maintenanceStatement, monthBounds } from "@/lib/maintenance";
import { downloadReceipt, downloadStatement } from "@/lib/receipt";
import { MaintenanceSettings } from "@/components/maintenance-settings";
import { RecurringSchedulesSettings } from "@/components/recurring-expenses";
import { loadBillingConfiguration, type SocietyConfiguration } from "@/lib/configuration";
import type { MaintenanceRate, MaintenanceBill } from "@/lib/billing-config";
import { useServerFn } from "@tanstack/react-start";
import { assignRoleByEmail } from "@/lib/role-assignment.functions";
import { societyDate } from "@/lib/accounting-date";
import { suspectedPaymentGroups } from "@/lib/payment-review";
import { ManageLoginForm } from "@/components/manage-login";
import { PresidentFlatTools } from "@/components/president-flat-register";
import { PilotAcknowledgments } from "@/components/pilot-acknowledgments";
import { settingsSections } from "@/lib/settings-access";

type Page = "owners" | "flats" | "tenants" | "maintenance" | "payments" | "settings";
type Flat = Account & { occupancy: string; floor?: string | null; parking_slot?: string | null; vehicle_type?: string | null; vehicle_numbers?: string | null; house_tax_number?: string | null; aadhaar_number?: string | null; tenant_start?: string | null; tenant_end?: string | null };
const selectClass = "mt-1.5 w-full rounded-xl border border-input bg-muted px-4 py-3 text-foreground";
function Selector({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <label className="block text-sm font-medium text-muted-foreground">{label}<select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function receipt(payment: Payment, flat: Account, societyName?: string | null) {
  downloadReceipt({ receiptNo: payment.receipt_no, flatNumber: flat.flat_number, residentName: flat.resident_name, amount: payment.amount, method: payment.method, paidOn: payment.paid_on, monthCovered: payment.month_covered, reference: payment.reference, ...(societyName ? { societyName } : {}) });
}
function statementPdf(flat: Flat, payments: Payment[], month: string, rates: MaintenanceRate[], bills: MaintenanceBill[], societyName?: string | null) {
  const s = maintenanceStatement(flat, payments, month, rates, bills);
  const [yy, mm] = month.split("-").map(Number) as [number, number];
  const next = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
  downloadStatement({
    flatNumber: flat.flat_number, ownerName: flat.resident_name, monthLabel: monthName(month), dueDate: s.dueDate,
    billed: s.billed, currentOutstanding: s.currentOutstanding, previous: s.previous, outstanding: s.outstanding, credit: s.credit, status: s.status,
    payments: payments.filter((p) => p.flat_id === flat.id && p.paid_on < next).sort((a, b) => a.paid_on.localeCompare(b.paid_on)).map((p) => ({ date: p.paid_on, amount: p.amount, method: p.method, status: p.status, receiptNo: p.receipt_no })),
    fileName: `Maintenance-${flat.flat_number.replace(/[^a-zA-Z0-9-]/g, "_")}-${month}.pdf`,
    ...(societyName ? { societyName } : {}),
  });
}

export function AdministrativePage({ page }: { page: Page }) {
  const navigate = useNavigate();
  const { role, loading, name, userId, email, societyName } = useSessionRole();
  const writable = canSubmitChanges(role);
  const finance = page === "maintenance" || page === "payments";
  const [ready, setReady] = useState(false);
  const [fullAadhaar, setFullAadhaar] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [flats, setFlats] = useState<Flat[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<SocietyConfiguration | null>(null);
  const [rates, setRates] = useState<MaintenanceRate[]>([]);
  const [bills, setBills] = useState<MaintenanceBill[]>([]);
  const [month, setMonth] = useState(societyDate().slice(0, 7));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [flatId, setFlatId] = useState("all");
  const [editing, setEditing] = useState<Flat | "new" | null>(null);
  const [cash, setCash] = useState<Flat | null>(null);
  const [login, setLogin] = useState<Flat | null>(null);
  const [manage, setManage] = useState<Flat | null>(null);
  const [details, setDetails] = useState<Flat | Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const flatsQuery = page === "settings" ? null : role === "treasurer" ? supabase.from("finance_accounts").select("*").order("flat_number") : finance ? supabase.from("flat_accounts").select("*").order("flat_number") : supabase.from("flats").select("*").order("flat_number");
      const paymentsQuery = finance ? supabase.from("payments").select("*").order("paid_on", { ascending: false }) : null;
      const settingsQuery = page === "settings" || page === "payments" ? supabase.from("society_settings").select("*").eq("id", true).maybeSingle() : null;
      const [configuration, flatsResult, paymentsResult, settingsResult] = await Promise.all([page === "settings" ? Promise.resolve({ rates: [], bills: [] }) : loadBillingConfiguration(), flatsQuery, paymentsQuery, settingsQuery]);
      setRates(configuration.rates); setBills(configuration.bills);
      if (flatsResult) { if (flatsResult.error) throw flatsResult.error; setFlats((flatsResult.data ?? []) as unknown as Flat[]); }
      if (paymentsResult) { if (paymentsResult.error) throw paymentsResult.error; setPayments((paymentsResult.data ?? []) as Payment[]); }
      if (settingsResult) { if (settingsResult.error) throw settingsResult.error; setSettings(settingsResult.data); }
      if (page === "settings" && settingsResult?.data && (role === "president" || role === "secretary")) {
        const configuration = await loadBillingConfiguration();
        setRates(configuration.rates); setBills(configuration.bills);
      }
    } catch { setError("Could not load these records. Please try again."); }
  }, [page, role, finance]);
  useEffect(() => {
    let active = true;
    if (loading) return;
    setReady(false);
    (async () => {
      const [allowed] = await Promise.all([
        supabase.rpc("has_permission", { _permission: finance || (page === "settings" && role === "treasurer") ? "finance.read" : "admin.read" }),
        load(),
      ]);
      if (!active) return;
      if (!allowed.data) { await navigate({ to: "/my-flat", replace: true }); return; }
      setReady(true);
    })();
    return () => { active = false; };
  }, [loading, finance, load, navigate]);
  async function saved() { setEditing(null); setCash(null); setLogin(null); setManage(null); await load(); if (role === "secretary") setMessage("Submitted for President approval."); }
  async function decide(payment: Payment, confirmed: boolean) {
    setBusy(true);
    const result = await supabase.rpc("decide_payment", { _id: payment.id, _confirm: confirmed });
    setBusy(false); if (result.error) setError(result.error.message); else setMessage(confirmed ? "Payment confirmed." : "Payment marked not received.");
    await load();
  }
  if (!ready) return <PageLoader title={`Loading ${page}…`} subtitle="Fetching society records" />;
  const { start, next } = monthBounds(month);
  const rows = flats.map((f) => ({ ...f, flat_number: f.flat_number.trim(), ...maintenanceStatement(f, payments, month, rates, bills) })).filter((f) => `${f.flat_number} ${finance && role === "treasurer" ? "" : `${f.resident_name} ${f.tenant_name ?? ""}`}`.toLowerCase().includes(search.toLowerCase()) && (page !== "maintenance" || status === "all" || f.status === status));
  const transactions = payments.filter((p) => (!month || p.paid_on >= start && p.paid_on < next) && (flatId === "all" || p.flat_id === flatId) && (status === "all" || p.status === status));
  const selectedFlat = details && "flat_number" in details ? details : undefined;
  const selectedPayment = details && "flat_id" in details ? details : undefined;
  const paymentFlat = selectedPayment ? flats.find((f) => f.id === selectedPayment.flat_id) : undefined;
  const suspects = suspectedPaymentGroups(payments);
  const sections = settingsSections(role, settings !== null);

  return <main className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase text-muted-foreground">{societyName ?? "Your apartment"}</p><h1 className="mt-1 font-display text-4xl font-bold capitalize">{page === "flats" ? "Flats & Residents" : page}</h1>{page === "flats" && <p className="mt-1 text-sm text-muted-foreground">Flat, owner, login and tenant details in one place.</p>}</div>{page === "flats" && role === "president" && <PresidentFlatTools onReveal={setFullAadhaar} />}{page === "flats" && <Button disabled={!writable || flats.length >= 15} onClick={() => setEditing("new")}>Add flat</Button>}{page === "payments" && <Selector label="Record cash for flat" value="" onChange={(id) => setCash(flats.find((f) => f.id === id) ?? null)} options={[{ value: "", label: "Select flat" }, ...(writable ? flats.map((f) => ({ value: f.id, label: f.flat_number })) : [])]} />}</header>
    {error && <div className="mt-4"><Notice tone="error">{error}</Notice><Button variant="outline" onClick={load}>Retry</Button></div>}{message && <div className="mt-4"><Notice tone="ok">{message}</Notice></div>}
    {page === "settings" ? <>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">My profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">{name ?? "Name not set"} · {roleLabel(role)} · {email}</p>
        {userId && <ProfileNameForm userId={userId} initialName={name} />}
        {userId && <PushSettings userId={userId} />}
      </section>
      {sections.roles && <RoleSettings />}
      {sections.acknowledgments && <PilotAcknowledgments role={role} />}
      {sections.recurring && <RecurringSchedulesSettings role={role} writable />}
      {sections.apartment && settings && <GeneralSettings settings={settings} rates={rates} onSaved={load} writable={writable} role={role} />}
      {!settings && (role === "president" || role === "secretary") && <p className="mt-6 text-sm text-muted-foreground">Maintenance and reminder configuration is not available for this society yet.</p>}
    </> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {finance && <Field label="Month and year" type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} />}
        {page !== "payments" && <Field label="Search flat or owner" value={search} onChange={(e) => setSearch(e.target.value)} />}
        {page === "payments" && <Selector label="Flat" value={flatId} onChange={setFlatId} options={[{ value: "all", label: "All flats" }, ...flats.map((f) => ({ value: f.id, label: f.flat_number }))]} />}
        {finance && <Selector label="Payment status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...(page === "payments" ? [{ value: "confirmed", label: "Confirmed" }, { value: "pending", label: "Pending confirmation" }, { value: "rejected", label: "Not received" }] : [{ value: "paid", label: "Paid" }, { value: "partial", label: "Partially Paid" }, { value: "outstanding", label: "Unpaid" }])]} />}
      </div>
      {page === "maintenance" && <div className="mt-6 grid gap-4 sm:grid-cols-3"><Tile label="Monthly bills" value={rupees(rows.reduce((t, f) => t + f.billed, 0))} /><Tile label="Carried-forward dues remaining" value={rupees(rows.reduce((t, f) => t + f.previous, 0))} /><Tile label="Outstanding" value={rupees(rows.reduce((t, f) => t + f.outstanding, 0))} tone="clay" /></div>}
      {page === "payments" ? <>
        {suspects.length > 0 && <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Possible duplicate payments</h2><p className="mt-2 text-sm text-muted-foreground">Review the receipts below. These may be separate payments; all records remain included in totals and nothing has been changed.</p><ul className="mt-3 divide-y divide-border">{suspects.map((group) => <li key={group[0]?.id} className="py-3 text-sm">Flat {flats.find((f) => f.id === group[0]?.flat_id)?.flat_number ?? "—"} · {rupees(group[0]?.amount)} each · {shortDate(group[0]?.paid_on)} · {group.map((p) => p.receipt_no).join(" / ")}</li>)}</ul></section>}
        <h2 className="mt-8 text-xl font-semibold">Payment transactions</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border"><tr>{["Flat / owner", "Date", "Amount", "Method", "Status", "Actions"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{transactions.map((p) => { const f = flats.find((f) => f.id === p.flat_id); return <tr key={p.id} className="border-b border-border"><td className="p-3">{f?.flat_number ?? "—"}{role !== "treasurer" && <span className="block text-muted-foreground">{f?.resident_name}</span>}</td><td className="p-3 whitespace-nowrap">{shortDate(p.paid_on)}</td><td className="p-3 whitespace-nowrap">{rupees(p.amount)}</td><td className="p-3">{p.method === "upi" ? "UPI / PhonePe" : "Cash"}</td><td className="p-3">{p.status === "confirmed" ? "Confirmed" : p.status === "pending" ? "Pending confirmation" : "Not received"}</td><td className="p-3"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDetails(p)}>Details</Button>{p.method === "upi" && <Button variant="outline" onClick={async () => { if (!(await openPaymentProof(p.flat_id, p.paid_on, p.id))) setError("No screenshot attached to this payment."); }}>View proof</Button>}{p.status === "confirmed" && f && <Button variant="outline" onClick={() => receipt(p, f, societyName)}>Receipt</Button>}{p.status === "pending" && canConfirmPayments(role) && <><Button disabled={busy} onClick={() => decide(p, true)}>Confirm</Button><Button variant="outline" disabled={busy} onClick={() => decide(p, false)}>Not received</Button></>}</div></td></tr>; })}</tbody></table>{!transactions.length && <p className="py-6 text-muted-foreground">No payments for this selection.</p>}</div>
        {canConfirmPayments(role) && <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Payment configuration</h2>{settings && <SettingsForm settings={settings} onSaved={load} />}</section>}
      </> : <div className="mt-6 divide-y divide-border border-t border-border">{!rows.length && <p className="py-6 text-muted-foreground">No matching flats.</p>}{rows.map((f) => <article key={f.id} className="grid items-start gap-4 py-5 md:grid-cols-[0.6fr_1.4fr_auto]"><p className="font-semibold">{f.flat_number}</p><div>
        {page === "tenants" ? <><p className="font-semibold">{f.occupancy === "rented" ? f.tenant_name || "No tenant recorded" : "Owner Occupied"}</p>{f.occupancy === "rented" && <><p className="break-words text-sm text-muted-foreground">{f.tenant_phone || "—"} · {f.tenant_email || "—"}</p><p className="text-sm text-muted-foreground">{shortDate(f.tenant_start)} – {shortDate(f.tenant_end)}</p></>}</> : <>{role !== "treasurer" && <p className="font-semibold">{f.resident_name}</p>}{page === "owners" && <p className="text-sm text-muted-foreground">{f.mobile} · {f.resident_user_id ? "Owner login linked" : "No login linked"}</p>}{page === "flats" && <><p className="text-sm text-muted-foreground">Owner mobile {f.mobile || "—"} · {f.resident_user_id ? "Login linked" : "No login yet"}</p><p className="mt-1 text-sm">{f.occupancy === "rented" ? <>Rented to <span className="font-medium">{f.tenant_name || "tenant not recorded"}</span>{f.tenant_phone ? ` · ${f.tenant_phone}` : ""}{f.tenant_start ? ` · ${shortDate(f.tenant_start)} – ${shortDate(f.tenant_end)}` : ""}</> : "Owner lives here"}</p>{(f.floor || f.parking_slot || f.vehicle_numbers || f.house_tax_number || f.aadhaar_number) && <p className="mt-1 text-sm text-muted-foreground">{[f.floor && `Floor ${f.floor}`, f.parking_slot && `Parking ${f.parking_slot}`, f.vehicle_type && f.vehicle_type !== "none" && `${f.vehicle_type}${f.vehicle_numbers ? ` ${f.vehicle_numbers}` : ""}`, f.house_tax_number && `House tax ${f.house_tax_number}`, f.aadhaar_number && (fullAadhaar?.[f.id] ? `Aadhaar ${fullAadhaar[f.id]}` : `Aadhaar XXXX XXXX ${f.aadhaar_number.slice(-4)}`)].filter(Boolean).join(" · ")}</p>}</>}{page === "maintenance" && <><p className="mt-1 text-sm">Bill {rupees(f.billed)} · Due {shortDate(f.dueDate)}</p><p className="text-sm">Carried forward {rupees(f.previous)} · Outstanding {rupees(f.outstanding)}</p><div className="mt-2"><StatusPill status={f.status} /></div></>}</>}
      </div><div className="flex flex-wrap gap-2">{page === "maintenance" ? <><Button variant="outline" onClick={() => setDetails(f)}>Statement / history</Button><Button variant="outline" onClick={() => statementPdf(f, payments, month, rates, bills, societyName)}>Download statement</Button></> : <>{writable && <Button variant="outline" onClick={() => setEditing(f)}>Edit</Button>}{(page === "owners" || page === "flats") && !f.resident_user_id && <Button variant="outline" disabled={!writable} onClick={() => setLogin(f)}>Create login</Button>}{(page === "owners" || page === "flats") && f.resident_user_id && (role === "admin" || role === "president") && <Button variant="outline" onClick={() => setManage(f)}>Manage login</Button>}{page === "flats" && (role === "admin" || role === "president") && <Button variant="outline" disabled={busy} onClick={async () => { if (!confirm(`Delete flat ${f.flat_number}? This cannot be undone.`)) return; setBusy(true); setError(""); setMessage(""); const r = await supabase.from("flats").delete().eq("id", f.id); setBusy(false); if (r.error) setError(r.error.message); else { setMessage(`Flat ${f.flat_number} deleted. You can now add a new flat.`); await load(); } }}>Delete</Button>}{(page === "tenants" || page === "flats") && f.occupancy === "rented" && writable && <Button variant="outline" onClick={async () => { if (!confirm("Remove tenant details and mark this flat Owner Occupied?")) return; const values = { occupancy: "owner", tenant_name: null, tenant_phone: null, tenant_email: null, tenant_start: null, tenant_end: null }; const result = await saveAdministrativeChange({ module: "flats", action: "update", key: f.id, values }, () => supabase.from("flats").update(values).eq("id", f.id)); if (result.error) setError(result.error.message); else { setMessage(result.pending ? "Submitted for President approval." : "Tenant details removed."); await load(); } }}>Remove tenant</Button>}</>}</div></article>)}</div>}
    </>}
  </div>
  {editing && <FlatForm title={editing === "new" ? "Add flat" : `Edit ${page === "tenants" ? "tenant" : page === "owners" ? "owner" : "flat"} · ${editing.flat_number}`} scope={page === "tenants" ? "tenant" : page === "owners" ? "owner" : "flat"} flat={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={saved} />}
  {cash && <CashForm flat={cash} onClose={() => setCash(null)} onSaved={saved} />}{login && <LoginForm flat={login} onClose={() => setLogin(null)} onSaved={saved} />}{manage && <ManageLoginForm flat={manage} onClose={() => setManage(null)} onSaved={saved} />}
  {selectedFlat && <Modal title={`Maintenance · ${selectedFlat.flat_number}`} onClose={() => setDetails(null)}><p>{monthName(month)} · Outstanding {rupees(maintenanceStatement(selectedFlat, payments, month, rates, bills).outstanding)}</p><h4 className="mt-4 font-semibold">Payment history</h4><ul className="divide-y divide-border">{payments.filter((p) => p.flat_id === selectedFlat.id && p.paid_on < next).map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{shortDate(p.paid_on)} · {rupees(p.amount)} · {p.status}</span>{p.status === "confirmed" && <QuietButton onClick={() => receipt(p, selectedFlat, societyName)}>Receipt</QuietButton>}</li>)}</ul></Modal>}
  {selectedPayment && <Modal title="Payment details" onClose={() => setDetails(null)}><dl className="space-y-3 text-sm">{[["Flat", paymentFlat?.flat_number], ["Date", shortDate(selectedPayment.paid_on)], ["Amount", rupees(selectedPayment.amount)], ["Method", selectedPayment.method], ["Status", selectedPayment.status], ["Month covered", selectedPayment.month_covered], ["Reference", selectedPayment.reference], ["Receipt number", selectedPayment.status === "confirmed" ? selectedPayment.receipt_no : "Not issued"], ["Notes", selectedPayment.notes]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}</dl></Modal>}
  </main>;
}

function GeneralSettings({ settings, rates, onSaved, writable, role }: { settings: SocietyConfiguration; rates: MaintenanceRate[]; onSaved: () => Promise<void>; writable: boolean; role: string | null }) {
  const { societyName } = useSessionRole();
  const [name, setName] = useState(societyName || settings.society_name);
  useEffect(() => { if (societyName) setName(societyName); }, [societyName]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <>
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Apartment configuration</h2><form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const values = { society_name: name.trim() }; const result = await saveAdministrativeChange({ module: "society_settings", action: "update", key: "true", values }, () => supabase.from("society_settings").update(values).eq("id", true)); setBusy(false); setMessage(result.error?.message ?? (result.pending ? "Submitted for President approval." : "Apartment name saved.")); await onSaved(); }}><div className="w-full max-w-md"><Field label="Apartment name" value={name} required disabled={!writable} onChange={(e) => setName(e.target.value)} /></div>{writable && <Button disabled={busy} type="submit">Save apartment name</Button>}</form>{message && <p className="mt-3 text-sm">{message}</p>}</section>
    <MaintenanceSettings settings={settings} rates={rates} onSaved={onSaved} writable={writable} />
    <RecurringSchedulesSettings role={role as "admin" | "president" | "secretary" | "treasurer" | "resident" | null} writable={writable} />
    {(role === "admin" || role === "president" || role === "secretary") && <RoleSettings />}
  </>;
}

function RoleSettings() {
  const { role } = useSessionRole();
  const assignRole = useServerFn(assignRoleByEmail);
  const [user, setUser] = useState("");
  const [chosenRole, setChosenRole] = useState<"resident" | "secretary" | "treasurer" | "president">("resident");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">User roles</h2><form className="mt-4 grid items-end gap-4 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMessage(""); try { const result = await assignRole({ data: { email: user.trim(), role: chosenRole } }); setMessage(result.ok ? result.pending ? "Submitted for President approval." : "User role updated." : result.error); if (result.ok && result.pending) window.dispatchEvent(new Event("approvals-changed")); } catch { setMessage("Could not change this role. Please try again."); } finally { setBusy(false); } }}><Field label="Email Address" type="email" autoComplete="email" value={user} required onChange={(e) => setUser(e.target.value)} /><Selector label="Role" value={chosenRole} onChange={(v) => { if (v === "resident" || v === "secretary" || v === "treasurer" || v === "president") setChosenRole(v); }} options={[{ value: "resident", label: "Resident" }, { value: "secretary", label: "Secretary" }, { value: "treasurer", label: "Treasurer" }, { value: "president", label: "President" }]} /><Button type="submit" disabled={busy}>{role === "secretary" ? "Propose role change" : "Save role"}</Button></form>{message && <p className="mt-3 text-sm">{message}</p>}{role === "secretary" && <Link to="/approvals" className="mt-3 inline-block text-sm text-primary">View proposed changes</Link>}</section>;
}