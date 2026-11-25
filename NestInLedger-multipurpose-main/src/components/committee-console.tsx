import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DashboardReports } from "@/components/dashboard-reports";
import { CommitteeBoard } from "@/components/committee-board";
import { FlatRegistrations } from "@/components/flat-registrations";
import { BrandMark } from "@/components/brand-logo";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ClayButton,
  Eyebrow,
  Field,
  Modal,
  Notice,
  Panel,
  PrimaryButton,
  QuietButton,
  StatusPill,
  Tile,
} from "@/components/app-ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { currentMonthLabel, fyLabel, fyStartOf, monthName, rupees, shortDate } from "@/lib/format";
import { type FundSummary, loadFund } from "@/lib/fund";
import { downloadReceipt } from "@/lib/receipt";
import { createResidentLogin } from "@/lib/residents.functions";
import { useSessionRole } from "@/lib/session";
import { canConfirmPayments, canSubmitChanges, roleLabel } from "@/lib/permissions";
import { saveAdministrativeChange } from "@/lib/approval";
import { loadBillingConfiguration } from "@/lib/configuration";
import { maintenanceStatement } from "@/lib/maintenance";
import { rateForMonth, type MaintenanceRate, type MaintenanceBill } from "@/lib/billing-config";
import { expenseAccountingMonth, periodCutoff, societyDate } from "@/lib/accounting-date";
import { submitPayment } from "@/lib/payment-submission";

export type Account = {
  id: string;
  flat_number: string;
  resident_name: string;
  mobile: string;
  resident_user_id: string | null;
  billing_start: string;
  outstanding: number;
  current_month_amount: number;
  status: string;
  occupancy?: string;
  tenant_name?: string | null;
  tenant_phone?: string | null;
  tenant_email?: string | null;
};

export type Payment = {
  id: string;
  flat_id: string;
  amount: number;
  method: string;
  status: string;
  paid_on: string;
  month_covered: string;
  reference: string | null;
  notes: string | null;
  receipt_no: string;
};

export function CommitteeConsole({ view }: { view: "overview" | "flats" | "owners" | "tenants" | "maintenance" | "payments" | "settings" }) {
  const navigate = useNavigate();
  const { role, loading: roleLoading, name, societyName } = useSessionRole();
  const writable = canSubmitChanges(role);
  const [changeMessage, setChangeMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pending, setPending] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<{ upi_id: string; payee_name: string }>({
    upi_id: "",
    payee_name: "",
  });
  const [addOpen, setAddOpen] = useState(false);
  const [cashFor, setCashFor] = useState<Account | null>(null);
  const [editFlat, setEditFlat] = useState<Account | null>(null);
  const [loginFor, setLoginFor] = useState<Account | null>(null);
  const [historyFor, setHistoryFor] = useState<Account | null>(null);

  const [collected, setCollected] = useState(0);
  const [spent, setSpent] = useState(0);
  const [trend, setTrend] = useState<{ label: string; collected: number; expenses: number }[]>([]);
  const [annual, setAnnual] = useState(false);
  const shownTrend = annual ? trend : trend.slice(-6);
  const [rates, setRates] = useState<MaintenanceRate[]>([]);
  const [bills, setBills] = useState<MaintenanceBill[]>([]);
  const [fund, setFund] = useState<FundSummary | null>(null);
  const [paysAll, setPaysAll] = useState<{ flat_id: string; amount: number; paid_on: string }[]>(
    [],
  );
  const [ym, setYm] = useState(() => {
    return societyDate().slice(0, 7);
  });

  const load = useCallback(async (month: string) => {
    const version = ++loadVersion.current;
    setLoadError("");
    try {
    const cutoff = periodCutoff(month);
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const nx = new Date(y ?? 2026, m ?? 1, 1);
    const next = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}-01`;
    const trendStartD = new Date(y ?? 2026, (m ?? 1) - 6, 1);
    const trendStart = `${trendStartD.getFullYear()}-${String(trendStartD.getMonth() + 1).padStart(2, "0")}-01`;
    const results =
      await Promise.all([
        role === "treasurer"
          ? supabase.from("finance_accounts").select("*").order("flat_number")
          : supabase.from("flat_accounts").select("*").order("flat_number"),
        supabase.from("payments").select("*").eq("status", "pending").order("created_at"),
        supabase.from("society_settings").select("upi_id, payee_name").limit(1),
        supabase
          .from("payments")
          .select("flat_id, amount, paid_on")
          .eq("status", "confirmed"),
        supabase.from("expenses").select("amount,expense_month,expense_date"),
        supabase.from("expenses").select("amount,expense_month,expense_date"),
      ]);
    if (results.some((result) => result.error)) throw new Error("Could not load accounting records.");
    const [{ data: accs }, { data: pend }, { data: s }, { data: pays }, { data: exps }, { data: trendExps }] = results;
    const config = await loadBillingConfiguration();
    const fyMonth = rateForMonth(config.rates, month).fy_start_month;
    const loadedFund = await loadFund(fyStartOf(new Date(y ?? 2026, (m ?? 1) - 1, 1), fyMonth), fyMonth, cutoff);
    let tenantRows: { id: string; occupancy: string; tenant_name: string | null; tenant_phone: string | null; tenant_email: string | null }[] = [];
    if (view === "tenants") {
      const tenants = await supabase.from("flats").select("id, occupancy, tenant_name, tenant_phone, tenant_email");
      if (tenants.error) throw tenants.error;
      tenantRows = tenants.data ?? [];
    }
    if (version !== loadVersion.current) return;
    setRates(config.rates); setBills(config.bills); setFund(loadedFund);
    const buckets: { label: string; collected: number; expenses: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y ?? 2026, (m ?? 1) - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bStart = `${key}-01`;
      const bNextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const bEnd = `${bNextD.getFullYear()}-${String(bNextD.getMonth() + 1).padStart(2, "0")}-01`;
      buckets.push({
        label: (monthName(key).split(" ")[0] ?? key).slice(0, 3),
        collected: (pays ?? [])
          .filter((p) => p.paid_on >= bStart && p.paid_on < bEnd && p.paid_on <= cutoff)
          .reduce((t, p) => t + Number(p.amount), 0),
        expenses: (trendExps ?? [])
          .filter((e) => expenseAccountingMonth(e) === key && key <= cutoff.slice(0, 7))
          .reduce((t, e) => t + Number(e.amount), 0),
      });
    }
    setTrend(buckets);
    if (view === "tenants") {
      setAccounts(((accs as Account[]) ?? []).map((a) => ({ ...a, ...tenantRows.find((t) => t.id === a.id) })));
    } else setAccounts((accs as Account[]) ?? []);
    setPending((pend as Payment[]) ?? []);
    if (s?.[0]) setSettings(s[0]);
    setPaysAll(pays ?? []);
    setCollected(
      (pays ?? [])
        .filter((p) => p.paid_on >= start && p.paid_on < next && p.paid_on <= cutoff)
        .reduce((t, p) => t + Number(p.amount), 0),
    );
    setSpent((exps ?? []).filter((e) => expenseAccountingMonth(e) === month && month <= cutoff.slice(0, 7)).reduce((t, e) => t + Number(e.amount), 0));
    } catch {
      if (version === loadVersion.current) setLoadError("Could not load accounting records. Please try again.");
    }
  }, [role, view]);

  useEffect(() => {
    let active = true;
    async function guard() {
      if (roleLoading) return;
      const { data: allowed } = await supabase.rpc("has_permission", {
        _permission: view === "overview" || view === "maintenance" || view === "payments" ? "finance.read" : "admin.read",
      });
      if (!active) return;
      if (!allowed) {
        navigate({ to: "/my-flat", replace: true });
        return;
      }
      await load(ym);
      if (active) setReady(true);
    }
    guard();
    return () => {
      active = false;
      loadVersion.current++;
    };
  }, [load, navigate, ym, view, roleLoading]);

  if (loadError) return <main className="p-10"><Notice tone="error">{loadError}</Notice><QuietButton onClick={() => load(ym)}>Retry</QuietButton></main>;
  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" aria-busy="true" aria-label="Loading dashboard">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative h-20 w-20">
            <div className="absolute inset-0 rounded-full border-4 border-muted" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary border-r-accent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <BrandMark className="size-9 animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Loading {societyName ?? "your apartment"}…</p>
            <p className="text-sm text-muted-foreground">Preparing accounts & committee summary</p>
          </div>
        </div>
      </main>
    );
  }

  const [selY, selM] = ym.split("-").map(Number);
  const fyMonth = rateForMonth(rates, ym).fy_start_month;
  // Same issued charges and approved rates as the account views, at the selected month.
  const monthAccounts = accounts.map((a) => {
    const statement = maintenanceStatement(a, paysAll.map((p) => ({ ...p, status: "confirmed" })), ym, rates, bills);
    return { ...a, ...statement, current_month_amount: statement.billed };
  });
  const totalFlats = monthAccounts.length;
  const paidCount = monthAccounts.filter((a) => a.billed > 0 && a.currentOutstanding === 0).length;
  const pendingCount = monthAccounts.filter((a) => a.currentOutstanding > 0).length;
  const monthOutstanding = monthAccounts.reduce(
    (sum, a) => sum + a.currentOutstanding,
    0,
  );
  const totalOutstanding = monthAccounts.reduce((sum, a) => sum + Number(a.outstanding), 0);

  const nowD = new Date();
  const maxYm = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  function shiftMonth(delta: number) {
    const d = new Date(selY ?? 2026, (selM ?? 1) - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setYm(next > maxYm ? maxYm : next);
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {role === "admin" ? <a href="/dashboard" className="mb-2 inline-block text-sm font-medium text-primary underline">← Back to Admin home</a> : null}
            <Eyebrow>{view === "overview" ? "Dashboard" : view[0]?.toUpperCase() + view.slice(1)}</Eyebrow>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              {(societyName ?? "Your apartment").toUpperCase()}
            </h1>
            {!roleLoading && (
              <p className="mt-2 text-sm text-muted-foreground">
                Welcome, {name ?? "Name not set"} · {roleLabel(role)}
              </p>
            )}
          </div>
          {view === "flats" ? <ClayButton disabled={!writable || totalFlats >= 15} onClick={() => setAddOpen(true)}>Add flat</ClayButton> : null}
        </header>
        {changeMessage ? <Notice tone="ok">{changeMessage}</Notice> : null}

        {view === "overview" ? <section className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>
              {monthName(ym)} · {fyLabel(fyStartOf(new Date(selY ?? 2026, (selM ?? 1) - 1, 1), fyMonth))}
            </Eyebrow>
            <div className="flex items-center gap-2">
              <QuietButton aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </QuietButton>
              <input
                type="month"
                aria-label="Select month and year"
                value={ym}
                max={maxYm}
                onChange={(e) => {
                  if (e.target.value) setYm(e.target.value > maxYm ? maxYm : e.target.value);
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm"
              />
              <QuietButton aria-label="Next month" disabled={ym >= maxYm} onClick={() => shiftMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </QuietButton>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Total Number of Flats" value={String(totalFlats)} />
            <Tile label="Total Number of Flats Paid This Month" value={String(paidCount)} tone="sage" />
            <Tile label="Number of Flats Pending This Month" value={String(pendingCount)} tone="clay" />
            <Tile label="Total outstanding" value={rupees(totalOutstanding)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Tile label="Maintenance collected this month" value={rupees(collected)} tone="sage" />
            <Tile label="Outstanding this month" value={rupees(monthOutstanding)} tone="clay" />
            <Tile label="Expenses this month" value={rupees(spent)} tone="clay" />
            <Tile label="Current financial year" value={fyLabel(fyStartOf(new Date(selY ?? 2026, (selM ?? 1) - 1, 1), fyMonth))} />
            <Tile label="Corporate Fund opening balance" value={fund?.openingRecorded ? rupees(fund.opening) : "Not recorded"} />
            <Tile label="Corporate Fund balance now" value={rupees(fund?.balance ?? 0)} tone="sage" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">As of {shortDate(periodCutoff(ym))} · Advance credit {rupees(monthAccounts.reduce((sum, a) => sum + a.credit, 0))}</p>
          <Panel className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-semibold tracking-tight">{annual ? "Annual trend" : "Six-month trend"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Maintenance collected and expenses
                </p>
              </div>
              <div className="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Graph period">
                <Button size="sm" variant={annual ? "ghost" : "default"} className="rounded-full" onClick={() => setAnnual(false)}>6 Months</Button>
                <Button size="sm" variant={annual ? "default" : "ghost"} className="rounded-full" onClick={() => setAnnual(true)}>Annual</Button>
              </div>
            </div>
            {shownTrend.some((t) => t.collected > 0 || t.expenses > 0) ? (
              <ChartContainer
                config={{
                  collected: { label: "Collected", color: "var(--color-sage-deep)" },
                  expenses: { label: "Expenses", color: "var(--color-primary)" },
                }}
                className="mt-4 h-64 w-full"
              >
                <BarChart data={shownTrend} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="collected" fill="var(--color-collected)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="mt-4 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
                No payments or expenses recorded in this period yet.
              </p>
            )}
            <DashboardReports mode={annual ? "yearly" : "monthly"} />
          </Panel>
        </section> : null}
        {view === "overview" ? <><CommitteeBoard /><FlatRegistrations /></> : null}

        {(view === "overview" || view === "payments") && pending.length > 0 ? (
          <Panel className="mt-6">
            <p className="font-display text-xl font-semibold tracking-tight">
              UPI payments to confirm
            </p>
            <ul className="mt-4 divide-y divide-border">
              {pending.map((p) => {
                const flat = accounts.find((a) => a.id === p.flat_id);
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {flat ? `${flat.flat_number} · ${flat.resident_name}` : "Flat"} ·{" "}
                        {rupees(p.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reference {p.reference || "—"} · {shortDate(p.paid_on)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <PrimaryButton
                        disabled={!canConfirmPayments(role)}
                        className="px-4 py-2.5 text-sm"
                        onClick={async () => {
                          const result = await supabase.rpc("decide_payment", { _id: p.id, _confirm: true });
                          setChangeMessage(result.error?.message ?? "Payment confirmed.");
                          await load(ym);
                        }}
                      >
                        Confirm
                      </PrimaryButton>
                      <QuietButton
                        disabled={!canConfirmPayments(role)}
                        onClick={async () => {
                          const result = await supabase.rpc("decide_payment", { _id: p.id, _confirm: false });
                          setChangeMessage(result.error?.message ?? "Payment marked not received.");
                          await load(ym);
                        }}
                      >
                        Not received
                      </QuietButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

      </div>

      {addOpen ? (
        <FlatForm
          title="Add flat"
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await load(ym);
          }}
        />
      ) : null}

      {editFlat ? (
        <FlatForm
          title={`Edit flat ${editFlat.flat_number}`}
          flat={editFlat}
          onClose={() => setEditFlat(null)}
          onSaved={async () => {
            setEditFlat(null);
            await load(ym);
          }}
        />
      ) : null}

      {cashFor ? (
        <CashForm
          flat={cashFor}
          onClose={() => setCashFor(null)}
          onSaved={async () => {
            setCashFor(null);
            await load(ym);
          }}
        />
      ) : null}

      {loginFor ? (
        <LoginForm
          flat={loginFor}
          onClose={() => setLoginFor(null)}
          onSaved={async () => {
            setLoginFor(null);
            await load(ym);
          }}
        />
      ) : null}

      {historyFor ? (
        <FlatHistory flat={historyFor} onClose={() => setHistoryFor(null)} />
      ) : null}
    </main>
  );
}

export function SettingsForm({
  settings,
  onSaved,
}: {
  settings: { upi_id: string; payee_name: string };
  onSaved: () => Promise<void>;
}) {
  const [upiId, setUpiId] = useState(settings.upi_id);
  const [payee, setPayee] = useState(settings.payee_name);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="mt-5 grid gap-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setOk("");
        setError("");
        const { error: updateError } = await supabase.rpc("set_payment_configuration", { _upi_id: upiId.trim(), _payee_name: payee.trim() });
        const pending = false;
        setBusy(false);
        if (updateError) {
          setError(updateError.message);
          return;
        }
        setOk(pending ? "Submitted for President approval." : "Saved.");
        await onSaved();
      }}
    >
      <Field
        label="UPI ID"
        value={upiId}
        placeholder="society@bank"
        onChange={(e) => setUpiId(e.target.value)}
      />
      <Field label="Name shown to residents" value={payee} onChange={(e) => setPayee(e.target.value)} />
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <ClayButton type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save UPI details"}
        </ClayButton>
        {ok ? <Notice tone="ok">{ok}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </form>
  );
}

export function FlatForm({
  title,
  flat,
  scope = "flat",
  onClose,
  onSaved,
}: {
  title: string;
  scope?: "flat" | "owner" | "tenant";
  flat?: Account | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [flatNumber, setFlatNumber] = useState(flat?.flat_number ?? "");
  const [name, setName] = useState(flat?.resident_name ?? "");
  const [mobile, setMobile] = useState(flat?.mobile ?? "");
  const [occupancy, setOccupancy] = useState<"owner" | "rented">("owner");
  const [tName, setTName] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!flat) return;
    supabase
      .from("flats")
      .select("occupancy, tenant_name, tenant_phone, tenant_email, tenant_start, tenant_end")
      .eq("id", flat.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setOccupancy(data.occupancy === "rented" ? "rented" : "owner");
        setTName(data.tenant_name ?? "");
        setTPhone(data.tenant_phone ?? "");
        setTEmail(data.tenant_email ?? "");
        setTStart(data.tenant_start ?? "");
        setTEnd(data.tenant_end ?? "");
      });
  }, [flat]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const rented = occupancy === "rented";
    const values = {
      ...(scope === "flat" ? { flat_number: flatNumber.trim() } : {}),
      ...(scope !== "tenant" ? { resident_name: name.trim(), mobile: mobile.trim() } : {}),
      ...(scope !== "owner" ? { occupancy,
      tenant_name: rented ? tName.trim() || null : null,
      tenant_phone: rented ? tPhone.trim() || null : null,
      tenant_email: rented ? tEmail.trim() || null : null,
      tenant_start: rented ? tStart || null : null,
      tenant_end: rented ? tEnd || null : null } : {}),
    };
    const { error: saveError } = await saveAdministrativeChange({ module: "flats", action: flat ? "update" : "create", key: flat?.id, values }, () => flat
      ? supabase.from("flats").update(values).eq("id", flat.id)
      : supabase.from("flats").insert({ ...values, flat_number: flatNumber.trim(), resident_name: name.trim(), mobile: mobile.trim() }));
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    await onSaved();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {scope === "flat" && <Field
          label="Flat number"
          value={flatNumber}
          required
          onChange={(e) => setFlatNumber(e.target.value)}
        />}
        {scope !== "tenant" && <><Field
          label="Owner name"
          value={name}
          required
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Owner mobile number"
          value={mobile}
          required
          onChange={(e) => setMobile(e.target.value)}
        /></>}
        {scope !== "owner" && <><div>
          <p className="mb-2 text-sm font-medium">Occupancy</p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={occupancy === "owner"}
                onChange={() => setOccupancy("owner")}
              />
              Owner Occupied
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={occupancy === "rented"}
                onChange={() => setOccupancy("rented")}
              />
              Rented
            </label>
          </div>
        </div>
        {occupancy === "rented" ? (
          <div className="space-y-4 rounded-2xl bg-muted p-4 ring-1 ring-border">
            <p className="text-sm font-semibold">Tenant details</p>
            <Field label="Tenant name" value={tName} required onChange={(e) => setTName(e.target.value)} />
            <Field label="Tenant phone" value={tPhone} required onChange={(e) => setTPhone(e.target.value)} />
            <Field label="Tenant email" type="email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
            <Field label="Tenant start date" type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} />
            <Field label="Tenant end date" type="date" value={tEnd} onChange={(e) => setTEnd(e.target.value)} />
          </div>
        ) : null}
        </>}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

export function CashForm({
  flat,
  onClose,
  onSaved,
}: {
  flat: Account;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(Number(flat.outstanding) || 1500));
  const [paidOn, setPaidOn] = useState(societyDate());
  const [month, setMonth] = useState(currentMonthLabel());
  const [notes, setNotes] = useState("");
  const [cashReviewed, setCashReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = {
      flat_id: flat.id,
      amount: Number(amount),
      method: "cash",
      status: "confirmed",
      paid_on: paidOn,
      month_covered: month,
      notes: notes.trim() || null,
    };
    const { error: insertError } = await submitPayment(values, cashReviewed);
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await onSaved();
  }

  return (
    <Modal title={`Record cash payment · ${flat.flat_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Amount received"
          type="number"
          min={1}
          step="1"
          value={amount}
          required
          hint="Part payments are allowed."
          onChange={(e) => setAmount(e.target.value)}
        />
        <Field
          label="Date"
          type="date"
          value={paidOn}
          max={societyDate()}
          required
          onChange={(e) => setPaidOn(e.target.value)}
        />
        <Field
          label="Payment description / declared period"
          value={month}
          required
          onChange={(e) => setMonth(e.target.value)}
        />
        <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cashReviewed} onChange={(e) => setCashReviewed(e.target.checked)} />I checked existing receipts; this is a separate cash payment. Add the reason in Notes.</label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

export function LoginForm({
  flat,
  onClose,
  onSaved,
}: {
  flat: Account;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const create = useServerFn(createResidentLogin);
  const { role } = useSessionRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (role === "secretary") {
        const result = await saveAdministrativeChange({ module: "flats", action: "create_login", key: flat.id, values: { email: email.trim().toLowerCase() } }, async () => ({ error: null }));
        if (result.error) { setError(result.error.message); return; }
        await onSaved();
        return;
      }
      const res = await create({ data: { flatId: flat.id, email: email.trim(), password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Create login · ${flat.flat_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Resident email"
          type="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        {role !== "secretary" ? <Field
          label="Temporary password"
          value={password}
          required
          minLength={6}
          hint="Share this with the resident. If this owner already has a login for another flat, use the same email — this flat will be added to that login and the old password stays."
          onChange={(e) => setPassword(e.target.value)}
        /> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create login"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function FlatHistory({ flat, onClose }: { flat: Account; onClose: () => void }) {
  const { societyName } = useSessionRole();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<{ occupancy: string; tenant_name: string | null; tenant_phone: string | null; tenant_email: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from("flats")
      .select("occupancy, tenant_name, tenant_phone, tenant_email")
      .eq("id", flat.id)
      .maybeSingle()
      .then(({ data }) => setTenant(data));
    supabase
      .from("payments")
      .select("*")
      .eq("flat_id", flat.id)
      .order("paid_on", { ascending: false })
      .then(({ data }) => setPayments((data as Payment[]) ?? []));
  }, [flat.id]);

  return (
    <Modal title={`Flat ${flat.flat_number}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Owner: {flat.resident_name} · {flat.mobile}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tenant?.occupancy === "rented"
          ? `Rented · Tenant: ${tenant.tenant_name ?? "-"} · ${tenant.tenant_phone ?? "-"}${tenant.tenant_email ? ` · ${tenant.tenant_email}` : ""}`
          : "Owner Occupied"}
      </p>
      <p className="mt-2 text-sm">
        Amount due now: <span className="font-mono font-semibold">{rupees(flat.outstanding)}</span>
      </p>
      <ul className="mt-4 divide-y divide-border">
        {payments.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">No payments yet.</p>
        ) : null}
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {rupees(p.amount)} · {p.month_covered}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.method === "upi" ? "UPI" : "Cash"} · {shortDate(p.paid_on)} ·{" "}
                {p.status === "confirmed"
                  ? "Confirmed"
                  : p.status === "pending"
                    ? "Waiting"
                    : "Not accepted"}
              </p>
            </div>
            {p.status === "confirmed" ? (
              <QuietButton
                onClick={() =>
                  downloadReceipt({
                    receiptNo: p.receipt_no,
                    flatNumber: flat.flat_number,
                    residentName: flat.resident_name,
                    amount: p.amount,
                    method: p.method,
                    paidOn: p.paid_on,
                    monthCovered: p.month_covered,
                    reference: p.reference,
                    ...(societyName ? { societyName } : {}),
                  })
                }
              >
                Receipt
              </QuietButton>
            ) : null}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
