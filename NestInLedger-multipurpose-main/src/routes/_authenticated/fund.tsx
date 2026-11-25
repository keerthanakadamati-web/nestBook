import { PageLoader } from "@/components/page-loader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ClayButton,
  Eyebrow,
  Field,
  Notice,
  Panel,
  QuietButton,
  Tile,
} from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { fyLabel, fyStartOf, fyRange, rupees, shortDate } from "@/lib/format";
import { type FundSummary, loadFund } from "@/lib/fund";
import { useSessionRole } from "@/lib/session";
import { canSubmitChanges } from "@/lib/permissions";
import { saveAdministrativeChange } from "@/lib/approval";
import { rateForMonth } from "@/lib/billing-config";
import { loadBillingConfiguration } from "@/lib/configuration";
import { expenseAccountingMonth, societyDate } from "@/lib/accounting-date";

export const Route = createFileRoute("/_authenticated/fund")({
  head: () => ({
    meta: [
      { title: "Corporate Fund — NestInLedger" },
      { name: "description", content: "Opening balance, money received, money spent and current balance." },
      { property: "og:title", content: "Corporate Fund — NestInLedger" },
      { property: "og:description", content: "Society fund balance for the committee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundPage,
});

function FundPage() {
  const navigate = useNavigate();
  const { role } = useSessionRole();
  const writable = canSubmitChanges(role);
  const [ready, setReady] = useState(false);
  const [yearOffset, setYearOffset] = useState(0);
  const [fy, setFy] = useState(fyStartOf());
  const [fyMonth, setFyMonth] = useState(4);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef(0);
  const [fund, setFund] = useState<FundSummary | null>(null);
  const [opening, setOpening] = useState("");
  const [transactions, setTransactions] = useState<{ id: string; date: string; description: string; amount: number; kind: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoadError("");
    try {
    const config = await loadBillingConfiguration();
    const today = societyDate();
    const reference = `${Number(today.slice(0, 4)) + yearOffset}${today.slice(4)}`;
    const startMonth = rateForMonth(config.rates, reference).fy_start_month;
    const selectedYear = fyStartOf(new Date(`${reference}T12:00:00`), startMonth);
    const f = await loadFund(selectedYear, startMonth);
    const { from, to } = fyRange(selectedYear, startMonth);
    const [pays, exps] = await Promise.all([
      supabase.from("payments").select("id,paid_on,amount,month_covered,receipt_no").eq("status", "confirmed").gte("paid_on", from).lt("paid_on", to).lte("paid_on", today),
      supabase.from("expenses").select("id,expense_date,expense_month,amount,category,description"),
    ]);
    if (pays.error || exps.error) throw new Error("Could not load fund history.");
    if (version !== loadVersion.current) return;
    setFy(selectedYear); setFyMonth(startMonth); setFund(f); setOpening(String(f.opening));
    setTransactions([
      ...(pays.data ?? []).map((p) => ({ id: p.id, date: p.paid_on, description: `${p.receipt_no} · ${p.month_covered}`, amount: Number(p.amount), kind: "Maintenance receipt" })),
      ...(exps.data ?? []).filter((e) => { const month = expenseAccountingMonth(e); return month >= from.slice(0, 7) && month < to.slice(0, 7) && month <= today.slice(0, 7); }).map((e) => ({ id: e.id, date: e.expense_date, description: `${e.category}${e.description ? ` · ${e.description}` : ""} · Accounting month ${expenseAccountingMonth(e)}`, amount: Number(e.amount), kind: "Expense" })),
    ].sort((a, b) => b.date.localeCompare(a.date)));
    } catch { if (version === loadVersion.current) setLoadError("Could not load fund records. Please try again."); }
  }, [yearOffset]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: allowed } = await supabase.rpc("has_permission", { _permission: "finance.read" });
      if (!active) return;
      if (!allowed) {
        navigate({ to: "/my-flat", replace: true });
        return;
      }
      await load();
      if (active) setReady(true);
    })();
    return () => {
      active = false;
      loadVersion.current++;
    };
  }, [load, navigate]);

  if (loadError) return <main className="p-10"><Notice tone="error">{loadError}</Notice><QuietButton onClick={load}>Retry</QuietButton></main>;
  if (!ready || !fund) return <PageLoader title="Loading Corporate Fund…" subtitle="Calculating current reserves" />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data: existing } = await supabase.from("fund_years").select("fy_start").eq("fy_start", fy).maybeSingle();
    const { error, pending } = await saveAdministrativeChange({ module: "fund_years", action: existing ? "update" : "create", key: String(fy), values: { opening_balance: Number(opening) || 0 } }, () => supabase
      .from("fund_years")
      .upsert({ fy_start: fy, opening_balance: Number(opening) || 0, updated_at: new Date().toISOString() }));
    setBusy(false);
    if (error) {
      setMsg({ tone: "error", text: "Could not save. Please try again." });
      return;
    }
    setMsg({ tone: "ok", text: pending ? "Submitted for President approval." : "Opening balance saved." });
    await load();
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Committee only</Eyebrow>
            <h1 className="font-display text-4xl font-bold tracking-tight">Corporate Fund</h1>
          </div>
          <Link to="/dashboard">
            <QuietButton>Back to dashboard</QuietButton>
          </Link>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <QuietButton onClick={() => setYearOffset(yearOffset - 1)}>‹ Previous year</QuietButton>
          <p className="font-display text-xl font-semibold">{fyLabel(fy)}</p>
          <QuietButton onClick={() => setYearOffset(yearOffset + 1)}>Next year ›</QuietButton>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {shortDate(fyRange(fy, fyMonth).from)} to {shortDate(new Date(new Date(`${fyRange(fy, fyMonth).to}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10))}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile label="Opening balance" value={fund.openingRecorded ? rupees(fund.opening) : "Not recorded"} />
          <Tile label="Money received" value={rupees(fund.received)} tone="sage" />
          <Tile label="Money spent" value={rupees(fund.spent)} tone="clay" />
          <Tile label="Current balance" value={rupees(fund.balance)} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Current balance = Opening balance + Money received − Money spent. Money received is
          confirmed maintenance (UPI and cash). Money spent is expenses.
        </p>

        {writable ? <Panel className="mt-6">
          <form onSubmit={save} className="flex flex-wrap items-end gap-3">
            <div className="w-60">
              <Field
                label={`Opening balance for ${fyLabel(fy)}`}
                type="number"
                step="1"
                value={opening}
                required
                onChange={(e) => setOpening(e.target.value)}
              />
            </div>
            <ClayButton type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save opening balance"}
            </ClayButton>
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          </form>
        </Panel> : null}
        <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-semibold">Fund transaction history</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border"><tr>{["Date", "Type", "Description", "Received", "Spent"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{transactions.map((t) => <tr key={t.id} className="border-b border-border"><td className="p-3 whitespace-nowrap">{shortDate(t.date)}</td><td className="p-3">{t.kind}</td><td className="p-3">{t.description}</td><td className="p-3 whitespace-nowrap">{t.kind === "Maintenance receipt" ? rupees(t.amount) : "—"}</td><td className="p-3 whitespace-nowrap">{t.kind === "Expense" ? rupees(t.amount) : "—"}</td></tr>)}</tbody></table>{!transactions.length && <p className="py-6 text-muted-foreground">No transactions for this financial year.</p>}</div></section>
      </div>
    </main>
  );
}
