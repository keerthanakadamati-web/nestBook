import { useCallback, useEffect, useState } from "react";

import { ClayButton, Eyebrow, Field, Modal, Notice, Panel, PrimaryButton, QuietButton, Tile } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { saveAdministrativeChange } from "@/lib/approval";
import { monthName, rupees, shortDate } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import {
  FREQUENCY_LABEL,
  dueDateFor,
  entryDisplayStatus,
  scheduleDueInMonth,
  suggestedCategories,
  type EntryDisplayStatus,
  type ExpenseAttachment,
  type RecurringEntry,
  type RecurringSchedule,
} from "@/lib/recurring";

const selectClass = "mt-1.5 w-full rounded-xl border border-input bg-muted px-4 py-3 text-foreground";

function statusClass(status: EntryDisplayStatus): string {
  if (status === "Paid") return "bg-sage/30 text-sage-deep";
  if (status === "Overdue") return "bg-clay/20 text-clay-deep";
  if (status === "Awaiting Approval") return "bg-secondary text-secondary-foreground";
  return "bg-muted text-muted-foreground";
}

function canAct(role: Role): boolean {
  return role === "admin" || role === "president" || role === "treasurer";
}

async function uploadAttachment(entryId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) return "File is larger than 5 MB.";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${entryId}/${crypto.randomUUID()}-${safe}`;
  const upload = await supabase.storage.from("expense-documents").upload(path, file);
  if (upload.error) return "Could not upload the document. Please try again.";
  const row = await supabase.from("expense_attachments").insert({ entry_id: entryId, file_path: path, file_name: file.name, file_size: file.size });
  if (row.error) {
    await supabase.storage.from("expense-documents").remove([path]);
    return "Could not link the document. Please try again.";
  }
  return "";
}

function AttachmentList({ entryId, refreshKey }: { entryId: string; refreshKey: number }) {
  const [items, setItems] = useState<ExpenseAttachment[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("expense_attachments").select("*").eq("entry_id", entryId).order("created_at", { ascending: false });
      if (active) setItems((data as ExpenseAttachment[]) ?? []);
    })();
    return () => { active = false; };
  }, [entryId, refreshKey]);
  if (!items.length) return <p className="text-sm text-muted-foreground">No documents attached yet.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="break-all">{a.file_name}</span>
          <QuietButton
            onClick={async () => {
              const { data, error } = await supabase.storage.from("expense-documents").createSignedUrl(a.file_path, 60);
              if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
            }}
          >
            View
          </QuietButton>
        </li>
      ))}
    </ul>
  );
}

export function RecurringEntryDocuments({ entryId }: { entryId: string }) {
  return <section className="mt-4"><h3 className="font-semibold">Bills and receipts</h3><AttachmentList entryId={entryId} refreshKey={0} /></section>;
}

function ScheduleForm({
  schedule,
  role,
  onClose,
  onSaved,
}: {
  schedule?: RecurringSchedule | undefined;
  role: Role;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(schedule?.name ?? "");
  const [category, setCategory] = useState(schedule?.category ?? suggestedCategories[0] ?? "");
  const [customCategory, setCustomCategory] = useState(schedule && !suggestedCategories.includes(schedule.category) ? schedule.category : "");
  const [amount, setAmount] = useState(schedule ? String(schedule.expected_amount) : "");
  const [dueDay, setDueDay] = useState(schedule?.due_day ?? 5);
  const [vendor, setVendor] = useState(schedule?.vendor ?? "");
  const [startDate, setStartDate] = useState(schedule?.start_date ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(schedule?.end_date ?? "");
  const [frequency, setFrequency] = useState<RecurringSchedule["frequency"]>(schedule?.frequency ?? "monthly");
  const [notes, setNotes] = useState(schedule?.notes ?? "");
  const [requiresReceipt, setRequiresReceipt] = useState(schedule?.requires_receipt ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOther = !suggestedCategories.includes(category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const finalCategory = (isOther ? customCategory : category).trim();
    const values = {
      name: name.trim(),
      category: finalCategory,
      expected_amount: Number(amount),
      due_day: Number(dueDay),
      vendor: vendor.trim() || null,
      start_date: startDate,
      end_date: endDate || null,
      frequency,
      notes: notes.trim() || null,
      requires_receipt: requiresReceipt,
    };
    if (!values.name || !finalCategory || !Number.isFinite(values.expected_amount) || values.expected_amount <= 0) {
      setBusy(false);
      setError("Enter a name, category and a positive expected amount.");
      return;
    }
    if (endDate && endDate < startDate) { setBusy(false); setError("End date cannot be before start date."); return; }
    const { data: s } = await supabase.auth.getSession();
    const { error: err, pending } = await saveAdministrativeChange(
      { module: "recurring_expenses", action: schedule ? "update" : "create", key: schedule?.id, values },
      () =>
        schedule
          ? supabase.from("recurring_expenses").update({ ...values, updated_at: new Date().toISOString() }).eq("id", schedule.id)
          : supabase.from("recurring_expenses").insert({ ...values, created_by: s.session?.user.id ?? null }),
    );
    setBusy(false);
    if (err) {
      setError("Could not save. Please check the details and try again.");
      return;
    }
    await onSaved(pending ? "Submitted for President approval." : schedule ? "Recurring expense updated." : "Recurring expense added.");
  }

  return (
    <Modal title={schedule ? "Edit recurring expense" : "Add recurring expense"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Expense name" value={name} required placeholder="e.g. Watchman salary" onChange={(e) => setName(e.target.value)} />
        <label className="block text-sm font-medium text-muted-foreground">
          Category
          <select aria-label="Category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {suggestedCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {!suggestedCategories.includes(category) ? <option value={category}>{category}</option> : null}
            <option value="Other">Other…</option>
          </select>
        </label>
        {category === "Other" || isOther ? (
          <Field label="Custom category" value={customCategory || (isOther ? category : "")} required onChange={(e) => { setCustomCategory(e.target.value); setCategory("Other"); }} />
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Expected amount (₹)" type="number" min={1} step="1" value={amount} required onChange={(e) => setAmount(e.target.value)} />
          <Field label="Due day of month" type="number" min={1} max={31} step={1} value={dueDay} required onChange={(e) => setDueDay(Number(e.target.value))} />
        </div>
        <Field label="Vendor, employee or service provider" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" type="date" value={startDate} required onChange={(e) => setStartDate(e.target.value)} />
          <Field label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <label className="block text-sm font-medium text-muted-foreground">
          Frequency
          <select aria-label="Frequency" className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringSchedule["frequency"])}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={requiresReceipt} onChange={(e) => setRequiresReceipt(e.target.checked)} />
          Bill or receipt is required for this expense
        </label>
        <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {role === "treasurer" ? <p className="text-sm text-muted-foreground">Your change will be sent for President approval before it takes effect.</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : schedule ? "Save changes" : "Add recurring expense"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function PaymentForm({
  schedule,
  entry,
  role,
  onClose,
  onSaved,
}: {
  schedule: RecurringSchedule;
  entry: RecurringEntry;
  role: Role;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(entry.expected_amount));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"cash" | "online">("online");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const differs = Number(amount) !== Number(entry.expected_amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const actual = Number(amount);
    if (!Number.isFinite(actual) || actual <= 0) {
      setBusy(false);
      setError("Enter the actual amount paid.");
      return;
    }
    if (differs && !notes.trim()) {
      setBusy(false);
      setError("The amount differs from the expected amount. Add a short note explaining the difference.");
      return;
    }
    if (schedule.requires_receipt && !file) {
      const { data, error: documentError } = await supabase.from("expense_attachments").select("id").eq("entry_id", entry.id).limit(1);
      if (documentError || !data?.length) {
        setBusy(false);
        setError("Attach the required bill or receipt before submitting this payment.");
        return;
      }
    }
    if (file) {
      const uploadError = await uploadAttachment(entry.id, file);
      if (uploadError) { setBusy(false); setError(uploadError); return; }
    }
    if (role === "treasurer") {
      const { error: err, pending } = await saveAdministrativeChange(
        { module: "recurring_entries", action: "update", key: entry.id, values: { status: "paid", actual_amount: actual, paid_on: paidOn, method, payment_reference: reference.trim() || null, notes: notes.trim() || null } },
        () => Promise.resolve({ error: { message: "Treasurer changes need President approval." } }),
      );
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      await onSaved(pending ? "Payment submitted for President approval." : "Payment recorded.");
      return;
    }
    const { error: err } = await supabase.rpc("pay_recurring_entry", { _entry: entry.id, _amount: actual, _paid_on: paidOn, _method: method, _reference: reference.trim(), _notes: notes.trim() });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    setBusy(false);
    await onSaved("Payment recorded and added to monthly expenses.");
  }

  return (
    <Modal title={`Record payment · ${schedule.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Expected {rupees(entry.expected_amount)} for {monthName(entry.period)} · Due {shortDate(dueDateFor(schedule, entry.period))}
          {schedule.vendor ? ` · ${schedule.vendor}` : ""}
        </p>
        <Field label="Actual amount paid (₹)" type="number" min={1} step="1" value={amount} required onChange={(e) => setAmount(e.target.value)} />
        <Field label="Payment date" type="date" value={paidOn} required onChange={(e) => setPaidOn(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-medium">Payment method</p>
          <div className="flex gap-2">
            {(["cash", "online"] as const).map((m) => (
              <QuietButton
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-full border px-4 py-2 text-sm ${method === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
              >
                {m === "cash" ? "Cash" : "Online"}
              </QuietButton>
            ))}
          </div>
        </div>
        <Field label="Payment reference" value={reference} placeholder="Transaction ID or receipt number" onChange={(e) => setReference(e.target.value)} />
        <Field label="Notes" value={notes} {...(differs ? { hint: "Required because the amount differs from the expected amount." } : {})} onChange={(e) => setNotes(e.target.value)} />
        <label className="block text-sm font-medium text-muted-foreground">
            Attach bill or receipt{schedule.requires_receipt ? " (required)" : ""} (max 5 MB)
            <input type="file" className="mt-1.5 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        {role === "treasurer" ? <p className="text-sm text-muted-foreground">The payment will be recorded after the President approves it.</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : role === "treasurer" ? "Submit for approval" : "Record payment"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

export function RecurringExpensesSection({ month, role, onChanged }: { month: string; role: Role; onChanged: () => Promise<void> }) {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RecurringSchedule | "new" | null>(null);
  const [paying, setPaying] = useState<{ schedule: RecurringSchedule; entry: RecurringEntry } | null>(null);
  const [viewing, setViewing] = useState<{ schedule: RecurringSchedule; entry: RecurringEntry } | null>(null);
  const [attachKey, setAttachKey] = useState(0);
  const allowed = canAct(role);

  const load = useCallback(async () => {
    const [s, e, p] = await Promise.all([
      supabase.from("recurring_expenses").select("*").order("name"),
      supabase.from("recurring_entries").select("*").eq("period", month),
      supabase.rpc("recurring_pending_entries"),
    ]);
    if (s.error || e.error) {
      setError("Could not load recurring expenses.");
      return;
    }
    setSchedules((s.data as RecurringSchedule[]) ?? []);
    setEntries((e.data as RecurringEntry[]) ?? []);
    setPendingKeys(new Set(p.data ?? []));
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saved(msg: string) {
    setEditing(null);
    setPaying(null);
    setViewing(null);
    setMessage(msg);
    await load();
    await onChanged();
  }

  async function generate() {
    setBusy(true);
    setError("");
    setMessage("");
    const { data, error: err } = await supabase.rpc("generate_recurring_entries", { _month: month });
    setBusy(false);
    if (err) {
      setError("Could not create this month's entries. Please try again.");
      return;
    }
    setMessage(data ? `Created ${data} new entr${data === 1 ? "y" : "ies"} for ${monthName(month)}.` : `All entries for ${monthName(month)} already exist.`);
    await load();
  }

  async function setScheduleStatus(schedule: RecurringSchedule, status: "active" | "paused" | "ended") {
    setError("");
    const { error: err, pending } = await saveAdministrativeChange(
      { module: "recurring_expenses", action: "update", key: schedule.id, values: { status } },
      () => supabase.from("recurring_expenses").update({ status, updated_at: new Date().toISOString() }).eq("id", schedule.id),
    );
    if (err) {
      setError("Could not update this schedule.");
      return;
    }
    setMessage(pending ? "Submitted for President approval." : `Schedule ${status === "active" ? "resumed" : status}.`);
    await load();
  }

  const due = schedules.filter((s) => entries.some((e) => e.recurring_id === s.id) || scheduleDueInMonth(s, month)).map((s) => {
    const entry = entries.find((e) => e.recurring_id === s.id);
    return entry?.schedule_snapshot ? { ...s, ...entry.schedule_snapshot } : s;
  });
  const entryFor = (id: string) => entries.find((e) => e.recurring_id === id);
  const statusOf = (s: RecurringSchedule) => { const entry = entryFor(s.id); return entryDisplayStatus(s, entry, month, entry ? pendingKeys.has(entry.id) : false); };
  const paidEntries = entries.filter((e) => e.status === "paid");
  const expected = due.reduce((t, s) => t + Number(entryFor(s.id)?.expected_amount ?? s.expected_amount), 0);
  const actualPaid = paidEntries.reduce((t, e) => t + Number(e.actual_amount ?? 0), 0);
  const statuses = due.map((s) => statusOf(s));
  const remaining = due.reduce((t, s) => t + (entryFor(s.id)?.status === "paid" ? 0 : Number(entryFor(s.id)?.expected_amount ?? s.expected_amount)), 0);

  return (
    <>
    <Panel className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Recurring &amp; Essential Expenses</Eyebrow>
          <h2 className="mt-1 font-display text-2xl font-semibold">{monthName(month)}</h2>
        </div>
        {allowed ? (
          <div className="flex flex-wrap gap-2">
            <ClayButton disabled={busy || !due.length} onClick={generate}>Create This Month&apos;s Expenses</ClayButton>
            <QuietButton onClick={() => setEditing("new")}>Add recurring expense</QuietButton>
          </div>
        ) : null}
      </div>
      {message ? <div className="mt-3"><Notice tone="ok">{message}</Notice></div> : null}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      {schedules.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No recurring expenses configured yet.{allowed ? " Add salaries, lift maintenance, electricity and other monthly essentials so they are tracked every month." : ""}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Expected" value={rupees(expected)} />
            <Tile label="Paid" value={String(statuses.filter((s) => s === "Paid").length)} />
            <Tile label="Due / unpaid" value={String(statuses.filter((s) => s === "Due" || s === "Not created").length)} />
            <Tile label="Overdue" value={String(statuses.filter((s) => s === "Overdue").length)} tone="clay" />
            <Tile label="Actual paid" value={rupees(actualPaid)} tone="sage" />
            <Tile label="Remaining" value={rupees(remaining)} tone="clay" />
          </div>

          <div className="mt-5 divide-y divide-border">
            {due.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No recurring expenses fall due in {monthName(month)}.</p> : null}
            {due.map((s) => {
              const entry = entryFor(s.id);
              const status = statusOf(s);
              return (
                <div key={s.id} className="grid grid-cols-1 items-center gap-2 py-4 md:grid-cols-[1.4fr_1fr_auto_auto]">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.category} · {FREQUENCY_LABEL[s.frequency]}
                      {s.vendor ? ` · ${s.vendor}` : ""}
                      {s.requires_receipt ? " · Receipt required" : ""}
                    </p>
                  </div>
                  <p className="text-sm">
                    <span className="font-mono">{rupees(entry?.expected_amount ?? s.expected_amount)}</span>
                    <span className="text-muted-foreground"> · Due {shortDate(dueDateFor(s, month))}</span>
                    {entry?.status === "paid" ? <span className="block text-muted-foreground">Paid {rupees(entry.actual_amount)} on {shortDate(entry.paid_on)}</span> : null}
                  </p>
                  <span className={`inline-block w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(status)}`}>{status}</span>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {allowed && entry && entry.status === "planned" && status !== "Awaiting Approval" ? (
                      <QuietButton onClick={() => setPaying({ schedule: s, entry })}>Record payment</QuietButton>
                    ) : null}
                    {entry ? <QuietButton onClick={() => setViewing({ schedule: s, entry })}>Details</QuietButton> : null}
                    {allowed ? <QuietButton onClick={() => { const current = schedules.find((schedule) => schedule.id === s.id); if (current) setEditing(current); }}>Edit</QuietButton> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

    </Panel>
      {editing ? <ScheduleForm schedule={editing === "new" ? undefined : editing} role={role} onClose={() => setEditing(null)} onSaved={saved} /> : null}
      {paying ? <PaymentForm schedule={paying.schedule} entry={paying.entry} role={role} onClose={() => setPaying(null)} onSaved={saved} /> : null}
      {viewing ? (
        <Modal title={`${viewing.schedule.name} · ${monthName(viewing.entry.period)}`} onClose={() => setViewing(null)}>
          <dl className="space-y-3 text-sm">
            {[
              ["Expected amount", rupees(viewing.entry.expected_amount)],
              ["Status", statusOf(viewing.schedule)],
              ["Actual amount paid", viewing.entry.actual_amount ? rupees(viewing.entry.actual_amount) : "—"],
              ["Payment date", shortDate(viewing.entry.paid_on)],
              ["Method", viewing.entry.method === "cash" ? "Cash" : viewing.entry.method === "online" ? "Online" : "—"],
              ["Payment reference", viewing.entry.payment_reference || "—"],
              ["Notes", viewing.entry.notes || "—"],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <h4 className="mt-5 font-semibold">Bills and receipts</h4>
          <div className="mt-2"><AttachmentList entryId={viewing.entry.id} refreshKey={attachKey} /></div>
          {allowed ? (
            <label className="mt-3 block text-sm font-medium text-muted-foreground">
              Attach a document (max 5 MB)
              <input
                type="file"
                className="mt-1.5 block w-full text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const err = await uploadAttachment(viewing.entry.id, f);
                  if (err) setError(err);
                  setAttachKey((k) => k + 1);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

export function RecurringSchedulesSettings({ role, writable }: { role: Role; writable: boolean }) {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<RecurringSchedule | "new" | null>(null);
  const allowed = canAct(role) && (writable || role === "treasurer");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("recurring_expenses").select("*").order("name");
    if (!err) setSchedules((data as RecurringSchedule[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(schedule: RecurringSchedule, status: "active" | "paused" | "ended") {
    setError("");
    setMessage("");
    const { error: err, pending } = await saveAdministrativeChange(
      { module: "recurring_expenses", action: "update", key: schedule.id, values: { status } },
      () => supabase.from("recurring_expenses").update({ status, updated_at: new Date().toISOString() }).eq("id", schedule.id),
    );
    if (err) {
      setError("Could not update this schedule.");
      return;
    }
    setMessage(pending ? "Submitted for President approval." : `Schedule ${status === "active" ? "resumed" : status}. Past expenses are kept.`);
    await load();
  }

  if (!canAct(role)) return null;
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="text-xl font-semibold">Recurring expenses</h2>
      <p className="mt-1 text-sm text-muted-foreground">Monthly essentials such as salaries, lift maintenance and electricity. Pausing or ending a schedule keeps all past expenses.</p>
      {allowed ? <div className="mt-3"><QuietButton onClick={() => setEditing("new")}>Add recurring expense</QuietButton></div> : null}
      {message ? <div className="mt-3"><Notice tone="ok">{message}</Notice></div> : null}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      <ul className="mt-4 divide-y divide-border text-sm">
        {schedules.length === 0 ? <li className="py-3 text-muted-foreground">No recurring expenses configured yet.</li> : null}
        {schedules.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-semibold">
                {s.name}
                {s.status !== "active" ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{s.status}</span> : null}
              </p>
              <p className="text-muted-foreground">
                {s.category} · {rupees(s.expected_amount)} · {FREQUENCY_LABEL[s.frequency]} · Due day {s.due_day}
                {s.vendor ? ` · ${s.vendor}` : ""}
              </p>
            </div>
            {allowed ? (
              <div className="flex flex-wrap gap-2">
                <QuietButton onClick={() => setEditing(s)}>Edit</QuietButton>
                {s.status === "active" ? <QuietButton onClick={() => setStatus(s, "paused")}>Pause</QuietButton> : null}
                {s.status === "paused" ? <QuietButton onClick={() => setStatus(s, "active")}>Resume</QuietButton> : null}
                {s.status !== "ended" ? <QuietButton onClick={() => setStatus(s, "ended")}>End</QuietButton> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <ScheduleForm
          schedule={editing === "new" ? undefined : editing}
          role={role}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            setMessage(msg);
            await load();
          }}
        />
      ) : null}
    </section>
  );
}
