import { PageLoader } from "@/components/page-loader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  ClayButton,
  Eyebrow,
  Field,
  Modal,
  Notice,
  Panel,
  PrimaryButton,
  QuietButton,
  Tile,
} from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { fyLabel, fyMonths, fyStartOf, monthName, rupees, shortDate } from "@/lib/format";
import { useSessionRole } from "@/lib/session";
import { canAddExpenses } from "@/lib/permissions";
import { saveAdministrativeChange } from "@/lib/approval";
import { RecurringExpensesSection } from "@/components/recurring-expenses";
import { useBillingRates } from "@/lib/use-billing-rates";
import { rateForMonth } from "@/lib/billing-config";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Monthly expenses — NestInLedger" },
      { name: "description", content: "Add, edit and review the society's monthly expenses." },
      { property: "og:title", content: "Monthly expenses — NestInLedger" },
      { property: "og:description", content: "Society expense list for the committee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  paid_by: string;
  method: string;
  notes: string | null;
  expense_month: string | null;
};

export function monthRange(month: string) {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}

function ExpensesPage() {
  const navigate = useNavigate();
  const { role } = useSessionRole();
  const writable = canAddExpenses(role);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [fy, setFy] = useState(fyStartOf());
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const rates = useBillingRates();
  const fyMonth = rateForMonth(rates, month).fy_start_month;
  useEffect(() => { setFy(fyStartOf(new Date(`${month}-01T12:00:00`), fyMonth)); }, [fyMonth, month]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [all, setAll] = useState<Expense[]>([]);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .in("expense_month", fyMonths(fy, fyMonth))
      .order("expense_date", { ascending: false });
    setAll((data as Expense[]) ?? []);
  }, [fy, fyMonth]);

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
    };
  }, [load, navigate]);

  if (!ready) return <PageLoader title="Loading Expenses…" subtitle="Fetching society vouchers and receipts" />;

  const months = fyMonths(fy, fyMonth);
  const monthTotal = (m: string) =>
    all.filter((e) => e.expense_month === m).reduce((s, e) => s + Number(e.amount), 0);
  const yearTotal = all.reduce((s, e) => s + Number(e.amount), 0);
  const items = all.filter((e) => e.expense_month === month && (categoryFilter === "all" || e.category === categoryFilter));

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Committee only</Eyebrow>
            <h1 className="font-display text-4xl font-bold tracking-tight">Monthly expenses</h1>
          </div>
          <div className="flex gap-2">
            <ClayButton disabled={!writable} onClick={() => setEditing("new")}>Add expense</ClayButton>
            <Link to="/dashboard">
              <QuietButton>Back to dashboard</QuietButton>
            </Link>
          </div>
        </header>
        {message ? <Notice tone="ok">{message}</Notice> : null}

        <RecurringExpensesSection month={month} role={role} onChanged={load} />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Field label="Month and year" type="month" value={month} onChange={(e) => { if (!e.target.value) return; setMonth(e.target.value); }} />
          <label className="text-sm font-medium text-muted-foreground">Category<select className="ml-2 rounded-xl border border-input bg-muted px-3 py-2 text-foreground" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{[...new Set(all.map((e) => e.category))].sort().map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <QuietButton onClick={() => { setFy(fy - 1); setMonth(fyMonths(fy - 1, rateForMonth(rates, `${fy - 1}-12`).fy_start_month)[0] ?? ""); }}>‹ Previous year</QuietButton>
          <p className="font-display text-xl font-semibold">{fyLabel(fy)}</p>
          <QuietButton onClick={() => { setFy(fy + 1); setMonth(fyMonths(fy + 1, rateForMonth(rates, `${fy + 1}-12`).fy_start_month)[0] ?? ""); }}>Next year ›</QuietButton>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Tile label={`Total expenses ${fyLabel(fy)}`} value={rupees(yearTotal)} tone="clay" />
          <Tile label={`Total for ${monthName(month)}`} value={rupees(items.reduce((sum, e) => sum + Number(e.amount), 0))} />
        </div>

        <Panel className="mt-6">
          <Eyebrow>Month-wise totals</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${
                  month === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                <span className="block font-medium">{monthName(m)}</span>
                <span className="font-mono">{rupees(monthTotal(m))}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="mt-6 overflow-hidden p-0 md:p-0">
          <p className="border-b border-border px-5 py-4 font-display text-lg font-semibold">
            {monthName(month)}
          </p>
          <div className="divide-y divide-border">
            {items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No expenses for this month yet.
              </p>
            ) : null}
            {items.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-1 items-center gap-2 px-5 py-4 md:grid-cols-[110px_1fr_auto_auto]"
              >
                <p className="text-sm text-muted-foreground">{shortDate(e.expense_date)}</p>
                <div>
                  <p className="font-semibold">
                    {e.category}
                    {e.description ? ` · ${e.description}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.method === "online" ? "Online" : "Cash"}
                    {e.paid_by ? ` · Paid by ${e.paid_by}` : ""}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </p>
                </div>
                <p className="font-mono text-sm">{rupees(e.amount)}</p>
                <div className="flex gap-2 md:justify-end">
                  <ExpenseBills expenseId={e.id} compact />
                  <QuietButton disabled={!writable} onClick={() => setEditing(e)}>Edit</QuietButton>
                  <QuietButton
                    disabled={!writable}
                    onClick={async () => {
                      if (!confirm("Delete this expense?")) return;
                      const result = await saveAdministrativeChange({ module: "expenses", action: "delete", key: e.id, values: {} }, () => supabase.from("expenses").delete().eq("id", e.id));
                      setMessage(result.error?.message ?? (result.pending ? "Deletion sent to the President for approval." : "Expense deleted."));
                      await load();
                    }}
                  >
                    Delete
                  </QuietButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {editing ? (
        <ExpenseForm
          expense={editing === "new" ? undefined : editing}
          defaultMonth={month}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}

function ExpenseForm({
  expense,
  defaultMonth,
  onClose,
  onSaved,
}: {
  expense?: Expense | undefined;
  defaultMonth: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [expMonth, setExpMonth] = useState(expense?.expense_month ?? defaultMonth);
  const [category, setCategory] = useState(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? "");
  const [method, setMethod] = useState(expense?.method ?? "cash");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bill, setBill] = useState<File | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = {
      expense_date: date,
      expense_month: expMonth,
      category: category.trim(),
      description: description.trim(),
      amount: Number(amount),
      paid_by: paidBy.trim(),
      method,
      notes: notes.trim() || null,
    };
    const { data: s } = await supabase.auth.getSession();
    if (bill && bill.size > 5 * 1024 * 1024) {
      setBusy(false);
      setError("Bill file is larger than 5 MB.");
      return;
    }
    let savedId: string | null = expense?.id ?? null;
    const { error: err, pending } = await saveAdministrativeChange({ module: "expenses", action: expense ? "update" : "create", key: expense?.id, values }, async () => {
      if (expense) return supabase.from("expenses").update(values).eq("id", expense.id);
      const r = await supabase.from("expenses").insert({ ...values, recorded_by: s.session?.user.id ?? null }).select("id").single();
      savedId = r.data?.id ?? null;
      return { error: r.error };
    });
    if (err) {
      setBusy(false);
      setError("Could not save. Please check the details and try again.");
      return;
    }
    if (bill && savedId && (!pending || expense)) {
      const uploadError = await uploadExpenseBill(savedId, bill);
      if (uploadError) {
        setBusy(false);
        setError(`Expense saved, but the bill was not attached: ${uploadError}`);
        return;
      }
    }
    setBusy(false);
    if (bill && pending && !expense) alert("Expense sent for approval. You can attach the bill from Edit after it is approved.");
    await onSaved();
  }

  return (
    <Modal title={expense ? "Edit expense" : "Add expense"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Expense date" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        <Field
          label="Month"
          type="month"
          value={expMonth}
          required
          hint="The month this expense belongs to."
          onChange={(e) => setExpMonth(e.target.value)}
        />
        <Field
          label="Category"
          value={category}
          required
          placeholder="e.g. Electricity, Security, Cleaning"
          onChange={(e) => setCategory(e.target.value)}
        />
        <Field label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Field
          label="Amount"
          type="number"
          min={1}
          step="1"
          value={amount}
          required
          onChange={(e) => setAmount(e.target.value)}
        />
        <Field label="Paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-medium">Payment method</p>
          <div className="flex gap-2">
            {["cash", "online"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-full border px-4 py-2 text-sm ${
                  method === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {m === "cash" ? "Cash" : "Online"}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="expense-bill">Bill (optional)</label>
          <input id="expense-bill" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(e) => setBill(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG, up to 5 MB.</p>
          {expense ? <div className="mt-2"><ExpenseBills expenseId={expense.id} /></div> : null}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save expense"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

async function uploadExpenseBill(expenseId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${expenseId}/${crypto.randomUUID()}-${safe}`;
  const upload = await supabase.storage.from("expense-documents").upload(path, file);
  if (upload.error) return "Could not upload the bill.";
  const row = await supabase.from("expense_attachments").insert({ expense_id: expenseId, file_path: path, file_name: file.name, file_size: file.size });
  if (row.error) {
    await supabase.storage.from("expense-documents").remove([path]);
    return "Could not link the bill.";
  }
  return "";
}

function ExpenseBills({ expenseId, compact }: { expenseId: string; compact?: boolean }) {
  const [items, setItems] = useState<{ id: string; file_name: string; file_path: string }[]>([]);
  useEffect(() => {
    let active = true;
    supabase.from("expense_attachments").select("id,file_name,file_path").eq("expense_id", expenseId).order("created_at", { ascending: false }).then(({ data }) => {
      if (active) setItems(data ?? []);
    });
    return () => { active = false; };
  }, [expenseId]);
  if (!items.length) return compact ? null : <p className="text-xs text-muted-foreground">No bill attached yet.</p>;
  const open = async (path: string) => {
    const { data } = await supabase.storage.from("expense-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a, i) => (
        <QuietButton key={a.id} type="button" title={a.file_name} onClick={() => open(a.file_path)}>
          {compact ? (items.length > 1 ? `View bill ${i + 1}` : "View bill") : `View ${a.file_name}`}
        </QuietButton>
      ))}
    </div>
  );
}
