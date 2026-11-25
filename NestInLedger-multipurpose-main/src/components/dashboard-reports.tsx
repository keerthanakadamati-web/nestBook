import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileSpreadsheet, Send, Check, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/app-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { listFinancialReports } from "@/lib/reports.functions";
import { reportPeriod, reportPdf, reportCsv, downloadReport, reportFileName, summaryFields, type FinancialReport } from "@/lib/report-downloads";
import { fyStartOf, rupees, shortDate } from "@/lib/format";
import { rateForMonth } from "@/lib/billing-config";
import { useSessionRole } from "@/lib/session";

const reportsQuery = queryOptions({ queryKey: ["financial-reports"], queryFn: () => listFinancialReports(), retry: false });

export function DashboardReports({ mode }: { mode: "monthly" | "yearly" }) {
  const { societyName } = useSessionRole();
  const { data: raw, refetch, isError } = useQuery(reportsQuery);
  const data = raw ?? { roles: [] as string[], reports: [] as unknown[], rates: [] as never[] };
  const treasurer = data.roles.includes("treasurer");
  const president = data.roles.includes("president");
  const secretary = data.roles.includes("secretary");
  const reports = (data.reports as unknown as FinancialReport[]).filter((r) => (r.period_type === "yearly" ? "yearly" : "monthly") === mode);
  const type = mode;
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(fyStartOf(new Date(), rateForMonth(data.rates, new Date().toISOString().slice(0, 7)).fy_start_month)));
  const fyMonth = rateForMonth(data.rates, `${year}-12`).fy_start_month;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ id: string; blob: Blob } | null>(null);
  const [confirmDialog, ask] = useConfirm();
  const selected = reports.find((r) => r.id === selectedId);

  if (isError) return null;
  async function prepare(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setPdf(null);
    try {
      const { data: id, error: err } = await supabase.rpc("prepare_financial_report", { _type: type, _start: type === "monthly" ? `${month}-01` : `${year}-${String(fyMonth).padStart(2, "0")}-01` });
      if (err) throw err;
      await refetch(); setSelectedId(id);
    } catch { setError("Could not prepare this report. Choose a current or previous month or financial year."); }
    finally { setBusy(false); }
  }
  async function transition(report: FinancialReport, action: "submit" | "review" | "approve" | "reject" | "withdraw") {
    setBusy(true); setError(""); setPdf(null);
    try {
      const { error: err } = await supabase.rpc("transition_financial_report", { _id: report.id, _action: action });
      if (err) throw err;
      await refetch();
    } catch { setError("This action could not be completed. Refresh and check the report status and your access."); }
    finally { setBusy(false); }
  }
  async function makePdf(report: FinancialReport) {
    setBusy(true); setError("");
    try { const blob = await reportPdf(report, societyName); setPdf({ id: report.id, blob }); downloadReport(new Blob([blob], { type: "application/pdf" }), reportFileName(report, "pdf", societyName)); }
    catch { setError("Could not create the PDF. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 border-t border-border pt-6">
    <h2 className="font-display text-xl font-semibold tracking-tight">{mode === "yearly" ? "Annual financial reports" : "Monthly reports"}</h2>
    {treasurer && <form onSubmit={prepare} className="mt-6 flex flex-wrap items-end gap-4 border-b border-border pb-6">
      <div><p className="mb-2 text-sm text-muted-foreground">Report period</p><div className="flex gap-2"><p className="font-semibold">{type === "monthly" ? "Monthly report" : "Financial year report"}</p></div></div>
      <div className="w-56">{type === "monthly" ? <Field label="Month" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} /> : <Field label={`Financial year starting in ${new Date(2026, fyMonth - 1, 1).toLocaleString("en-IN", { month: "long" })}`} type="number" min="1900" max="9998" required value={year} onChange={(e) => setYear(e.target.value)} />}</div>
      <Button disabled={busy} type="submit"><FileText />{busy ? "Please wait…" : "Prepare report"}</Button>
    </form>}
    {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    <section className="mt-6">
      {!reports.length && <p className="py-8 text-muted-foreground">No reports yet.</p>}
      {reports.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="p-3">Period</th><th className="p-3">Prepared by</th><th className="p-3">Submitted</th><th className="p-3">Status</th><th className="p-3">Report</th></tr></thead><tbody>{reports.map((r) => <tr key={r.id} className="border-b border-border"><td className="p-3 whitespace-nowrap">{reportPeriod(r)}<span className="block text-xs text-muted-foreground">{r.period_type === "yearly" ? "Financial year / year-to-date" : "Monthly"}</span></td><td className="p-3 break-all">{r.prepared_email}</td><td className="p-3 whitespace-nowrap">{r.submitted_at ? shortDate(r.submitted_at) : "Not submitted"}</td><td className="p-3 capitalize">{r.status}</td><td className="p-3"><Button variant="outline" onClick={() => { setSelectedId(r.id); setPdf(null); }}>View</Button></td></tr>)}</tbody></table></div>}
    </section>
    {selected && <section className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{reportPeriod(selected)}</h2><p className="mt-1 text-sm text-muted-foreground">Generated {shortDate(selected.generated_at)} · Prepared by {selected.prepared_email}</p><p className="mt-1 text-sm capitalize">{selected.status} · As of {selected.snapshot.asOf}</p></div>
        <div className="flex flex-wrap gap-2">
          {pdf?.id === selected.id ? <Button onClick={() => downloadReport(new Blob([pdf.blob], { type: "application/pdf" }), reportFileName(selected, "pdf", societyName))}><Download />Download PDF</Button> : <Button variant="outline" disabled={busy} onClick={() => makePdf(selected)}><Download />{busy ? "Preparing…" : "Download PDF"}</Button>}
          <Button variant="outline" onClick={() => downloadReport(new Blob([reportCsv(selected, societyName)], { type: "text/csv;charset=utf-8" }), reportFileName(selected, "csv", societyName))}><FileSpreadsheet />Download spreadsheet</Button>
          {treasurer && selected.status === "prepared" && <Button disabled={busy} onClick={() => transition(selected, "submit")}><Send />Submit to President &amp; Secretary</Button>}
          {(president || secretary) && ["submitted", "reviewed"].includes(selected.status) && !(president ? selected.president_reviewed_at : selected.secretary_reviewed_at) && <Button variant="outline" disabled={busy} onClick={() => transition(selected, "review")}><Check />Mark reviewed</Button>}
          {president && selected.status === "reviewed" && selected.president_reviewed_at && <Button disabled={busy} onClick={async () => { if (await ask({ title: "Approve financial report?", description: "Once approved, this report is locked and cannot be removed.", confirmLabel: "Approve report" })) void transition(selected, "approve"); }}><Check />Approve report</Button>}
          {president && ["submitted", "reviewed"].includes(selected.status) && <Button variant="outline" disabled={busy} onClick={async () => { if (await ask({ title: "Reject financial report?", description: "This removes the report from Reports and Documents. The Treasurer can prepare a corrected one.", confirmLabel: "Reject report", destructive: true })) { setSelectedId(null); void transition(selected, "reject"); } }}><Trash2 />Reject report</Button>}
          {treasurer && selected.status !== "approved" && <Button variant="outline" disabled={busy} onClick={async () => { if (await ask({ title: "Withdraw financial report?", description: "This removes the unapproved report from Reports and Documents so you can prepare a corrected version.", confirmLabel: "Withdraw report", destructive: true })) { setSelectedId(null); void transition(selected, "withdraw"); } }}><Trash2 />Withdraw report</Button>}
          {confirmDialog}
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">{summaryFields.map(([label, key]) => <div className="border-b border-border py-4" key={key}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold">{rupees(selected.snapshot[key])}</dd></div>)}</dl>
      <p className="mt-4 text-sm text-muted-foreground">{selected.snapshot.basis}</p>
      {!selected.snapshot.openingBalanceRecorded && <p className="mt-2 text-sm text-muted-foreground">No opening fund balance recorded for this financial year; the existing zero default is used.</p>}
      <div className="mt-5 space-y-1 text-sm"><p>Secretary review: {selected.secretary_reviewed_at ? shortDate(selected.secretary_reviewed_at) : "Not reviewed"}</p><p>President review: {selected.president_reviewed_at ? shortDate(selected.president_reviewed_at) : "Not reviewed"}</p><p>Approval: {selected.approved_at ? shortDate(selected.approved_at) : "Not approved"}</p></div>
      <h3 className="mt-6 text-lg font-semibold">Expenses by category</h3>{selected.snapshot.expenseCategories.length ? selected.snapshot.expenseCategories.map((e) => <p key={e.category} className="mt-2 flex justify-between gap-4 border-b border-border pb-2"><span>{e.category}</span><span>{rupees(e.amount)}</span></p>) : <p className="mt-2 text-muted-foreground">No expense records in this period.</p>}
      <h3 className="mt-6 text-lg font-semibold">Transaction details</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr>{["Date", "Type / flat", "Description", "Accounting month", "Reference", "Amount"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{selected.snapshot.transactions.map((t) => <tr key={t.id} className="border-b border-border"><td className="p-3 whitespace-nowrap">{t.date}</td><td className="p-3">{t.kind}{t.flat ? ` / ${t.flat}` : ""}</td><td className="p-3">{t.description}</td><td className="p-3">{t.accounting_month}</td><td className="p-3 break-all">{t.reference ?? "—"}</td><td className="p-3 whitespace-nowrap">{rupees(t.amount)}</td></tr>)}</tbody></table></div>
    </section>}
  </section>;
}
