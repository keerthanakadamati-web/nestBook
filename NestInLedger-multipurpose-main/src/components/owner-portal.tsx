import { MyFlatDetails } from "@/components/my-flat-details";
import { CommitteeBoard } from "@/components/committee-board";
import { PageLoader } from "@/components/page-loader";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Eyebrow,
  Field,
  Modal,
  Notice,
  Panel,
  PrimaryButton,
  QuietButton,
  StatusPill,
} from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { currentMonthLabel, rupees, shortDate } from "@/lib/format";
import { roleLabel } from "@/lib/permissions";
import { downloadReceipt } from "@/lib/receipt";
import { useSessionRole } from "@/lib/session";
import { ProfileNameForm } from "@/components/profile-name-form";
import { PushSettings } from "@/components/push-settings";
import { disableThisDevice } from "@/lib/push-client";
import { AnnouncementCard, loadAnnouncements, type Announcement } from "@/components/announcements-ui";
import { societyDate } from "@/lib/accounting-date";
import { submitPayment, uploadPaymentProof, openPaymentProof } from "@/lib/payment-submission";

function LatestAnnouncement() {
  const [latest, setLatest] = useState<Announcement | null | undefined>(undefined);
  useEffect(() => {
    loadAnnouncements(true, 1).then((rows) => setLatest(rows[0] ?? null));
  }, []);
  return (
    <Panel className="mt-6">
      <p className="font-display text-xl font-semibold tracking-tight">Latest announcement</p>
      <div className="mt-3">
        {latest ? (
          <>
            <AnnouncementCard a={latest} />
            <Link to="/announcements" className="mt-3 inline-block text-sm font-semibold text-primary">
              View all announcements
            </Link>
          </>
        ) : latest === null ? (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        ) : null}
      </div>
    </Panel>
  );
}

type Account = {
  id: string;
  flat_number: string;
  resident_name: string;
  mobile: string;
  outstanding: number;
  previous_outstanding: number;
  current_month_amount: number;
  current_outstanding: number;
  advance_credit: number;
  status: string;
};

type Payment = {
  id: string;
  flat_id: string;
  amount: number;
  method: string;
  status: string;
  paid_on: string;
  month_covered: string;
  reference: string | null;
  receipt_no: string;
};

export type OwnerView = "dashboard" | "maintenance" | "payments" | "tenants" | "profile";

export function OwnerPortal({ view }: { view: OwnerView }) {
  const { email, name, role, userId, societyName } = useSessionRole();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [occupancyById, setOccupancyById] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<{ upi_id: string; payee_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const paymentVersion = useRef(0);

  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  const load = useCallback(async () => {
    setLoadError("");
    const { data: accs, error: accountError } = await supabase
      .from("flat_accounts")
      .select("*")
      .order("flat_number");
    const list = (accs as Account[] | null) ?? [];
    if (accountError) { setLoadError("Could not load your flat records. Please try again."); setLoading(false); return; }
    setAccounts(list);
    const { data: fl, error: flatError } = await supabase.from("flats").select("id, occupancy");
    if (flatError) { setLoadError("Could not load your flat records. Please try again."); setLoading(false); return; }
    setOccupancyById(Object.fromEntries((fl ?? []).map((f) => [f.id, f.occupancy])));
    const { data: s } = await supabase
      .from("society_settings")
      .select("upi_id, payee_name")
      .limit(1);
    setSettings(s?.[0] ?? null);
    setLoading(false);
  }, []);

  const loadPayments = useCallback(async (flatId: string) => {
    const version = ++paymentVersion.current;
    setPayments([]);
    const { data: pays, error } = await supabase
      .from("payments")
      .select("id, flat_id, amount, method, status, paid_on, month_covered, reference, receipt_no")
      .eq("flat_id", flatId)
      .order("paid_on", { ascending: false });
    if (version !== paymentVersion.current) return;
    if (error) { setLoadError("Could not load payment history. Please try again."); return; }
    setPayments((pays as Payment[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (account) loadPayments(account.id);
    return () => { paymentVersion.current++; };
  }, [account?.id, loadPayments]);

  async function signOut() {
    await disableThisDevice().catch(() => undefined);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loadError) return <main className="p-10"><Notice tone="error">{loadError}</Notice><QuietButton onClick={async () => { await load(); if (account) await loadPayments(account.id); }}>Retry</QuietButton></main>;
  if (loading) {
    return <PageLoader title="Loading your flat…" subtitle="Fetching your dues and payments" />;
  }

  if (!account) {
    return (
      <main className="px-4 py-12 md:px-10">
        <div className="mx-auto max-w-xl">
          <Panel>
            <h1 className="font-display text-2xl font-bold">No flat linked yet</h1>
            <p className="mt-2 text-muted-foreground">
              Your login is not linked to a flat yet. Please ask the committee to link it.
            </p>
            <QuietButton className="mt-5" onClick={signOut}>
              Sign out
            </QuietButton>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Society accounts</Eyebrow>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              {view === "profile" ? "Settings" : (societyName ?? "Your apartment").toUpperCase()}
            </h1>
          </div>
        </header>

        {view === "profile" ? (<>
          <Panel className="mt-8">
            <p className="font-display text-xl font-semibold tracking-tight">My profile</p>
            <p className="mt-1 text-sm text-muted-foreground">Ask the committee if anything here is wrong.</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Name</span><span className="font-medium">{name ?? account.resident_name ?? "Name not set"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Role</span><span className="font-medium">{roleLabel(role)}</span></div>
              <div className="flex flex-wrap justify-between gap-3"><span className="text-muted-foreground">Email</span><span className="min-w-0 break-all font-medium">{email}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Mobile</span><span className="font-medium">{account.mobile}</span></div>
              <div className="flex flex-wrap justify-between gap-3"><span className="text-muted-foreground">Flats</span><span className="min-w-0 break-words font-medium">{accounts.map((a) => a.flat_number).join(", ")}</span></div>
            </div>
            {userId && <ProfileNameForm userId={userId} initialName={name ?? account.resident_name} />}
            {userId && <PushSettings userId={userId} />}
          </Panel>
          {userId && <MyFlatDetails userId={userId} />}
          </>
        ) : (<>
        {view === "dashboard" ? (
          <>
            <AccountOverview accounts={accounts} occupancyById={occupancyById} ownerName={name ?? account.resident_name} />
            <LatestAnnouncement />
            <CommitteeBoard />
          </>
        ) : null}
        {view !== "dashboard" && (<>
        <Panel className="mt-8">
          <p className="font-display text-xl font-semibold tracking-tight">My flats</p>
          <p className="mt-1 text-sm text-muted-foreground">Tap a flat to see its details.</p>
          <ul className="mt-4 divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setSelectedId(a.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left ${
                    a.id === account.id ? "bg-muted" : ""
                  }`}
                >
                  <div>
                    <p className="font-semibold">Flat {a.flat_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {occupancyById[a.id] === "rented" ? "Rented" : "Owner Occupied"}
                    </p>
                  </div>
                  <StatusPill status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          {view === "maintenance" && <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-3xl font-bold tracking-tight">
                  Flat {account.flat_number}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.resident_name} · {account.mobile}
                </p>
              </div>
              <StatusPill status={account.status} />
            </div>

            <div className="mt-6 rounded-3xl bg-muted p-6 text-center ring-1 ring-border">
              <p className="text-sm text-muted-foreground">
                Maintenance for {currentMonthLabel()}
              </p>
              <p className="font-display text-6xl font-bold tracking-tight text-clay-deep">
                {rupees(account.current_month_amount)}
              </p>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current maintenance remaining</span>
                <span className="font-mono font-medium">
                  {rupees(account.current_outstanding)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Previous dues remaining</span>
                <span className="font-mono font-medium">
                  {rupees(account.previous_outstanding)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total amount due</span>
                <span className="font-mono">{rupees(account.outstanding)}</span>
              </div>
            </div>
            {Number(account.advance_credit) > 0 && <p className="mt-3 text-sm text-sage-deep">Advance credit: {rupees(account.advance_credit)}</p>}

            <PrimaryButton
              className="mt-6 w-full py-5 text-lg"
              disabled={Number(account.outstanding) <= 0}
              onClick={() => setPayOpen(true)}
            >
              {Number(account.outstanding) > 0
                ? `Pay Maintenance · ${rupees(account.outstanding)}`
                : "Nothing due right now"}
            </PrimaryButton>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Pay by UPI, then enter the reference number so the committee can confirm it.
            </p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Prefer cash? You can also pay the Secretary or Treasurer in cash. They will record
              it and your receipt will appear here.
            </p>
          </Panel>}

          {view === "payments" && <Panel>
            <p className="font-display text-xl font-semibold tracking-tight">Payment history</p>
            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ul className="ledger mt-4 divide-y divide-border">
                {payments.filter((p) => p.flat_id === account.id).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 pl-11">
                    <div>
                      <p className="font-medium">{p.month_covered}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.method === "upi" ? "UPI" : "Cash"} · {shortDate(p.paid_on)} ·{" "}
                        {p.status === "confirmed"
                          ? "Confirmed"
                          : p.status === "pending"
                            ? "Waiting for committee"
                            : "Not accepted"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{rupees(p.amount)}</span>
                      {p.method === "upi" ? (
                        <button onClick={async () => { if (!(await openPaymentProof(p.flat_id, p.paid_on, p.id))) alert("No screenshot attached."); }} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold ring-1 ring-border">Screenshot</button>
                      ) : null}
                      {p.status === "confirmed" ? (
                        <button
                          onClick={() =>
                            downloadReceipt({
                              receiptNo: p.receipt_no,
                              flatNumber: account.flat_number,
                              residentName: account.resident_name,
                              amount: p.amount,
                              method: p.method,
                              paidOn: p.paid_on,
                              monthCovered: p.month_covered,
                              reference: p.reference,
                              ...(societyName ? { societyName } : {}),
                            })
                          }
                          className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-clay-deep ring-1 ring-border"
                        >
                          Receipt
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>}

          {view === "tenants" && <TenantPanel key={account.id} flatId={account.id} onSaved={load} />}
        </section>
        </>)}
        </>)}
      </div>

      {payOpen ? (
        <PayModal
          account={account}
          settings={settings}
          societyName={societyName}
          onClose={() => setPayOpen(false)}
          onDone={async () => {
            setPayOpen(false);
            await load();
            await loadPayments(account.id);
          }}
        />
      ) : null}
    </main>
  );
}

const quickLink =
  "inline-flex items-center rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-accent";

function AccountOverview({
  accounts,
  occupancyById,
  ownerName,
}: {
  accounts: Account[];
  occupancyById: Record<string, string>;
  ownerName: string;
}) {
  const total = accounts.length;
  const rented = accounts.filter((a) => occupancyById[a.id] === "rented").length;
  const ownerOccupied = total - rented;
  const paid = accounts.filter((a) => a.status === "paid").length;
  const pending = total - paid;
  const outstanding = accounts.reduce((sum, a) => sum + Number(a.outstanding ?? 0), 0);
  const pendingFlats = accounts.filter((a) => a.status !== "paid").length;

  const stats: { label: string; value: string; tone?: "sage" | "clay" | undefined }[] = [
    { label: "Total flats", value: String(total) },
    { label: "Owner occupied", value: String(ownerOccupied) },
    { label: "Rented", value: String(rented) },
    { label: "Maintenance paid", value: String(paid), tone: "sage" },
    { label: "Maintenance pending", value: String(pending), tone: pending > 0 ? "clay" : undefined },
    {
      label: "Total outstanding",
      value: rupees(outstanding),
      tone: outstanding > 0 ? "clay" : "sage",
    },
  ];

  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Account overview
      </p>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-tight md:text-3xl">
        Welcome, {ownerName}
      </h2>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p
              className={`break-words font-display text-xl font-semibold tabular-nums sm:text-2xl ${
                s.tone === "sage" ? "text-sage-deep" : s.tone === "clay" ? "text-clay-deep" : ""
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {outstanding > 0 ? (
        <div className="mt-5 rounded-2xl bg-clay/20 px-4 py-3 text-sm font-medium text-clay-deep">
          {pendingFlats} flat{pendingFlats === 1 ? " has" : "s have"} outstanding maintenance.
        </div>
      ) : null}
    </Panel>
  );
}

function PayModal({
  account,
  settings,
  societyName,
  onClose,
  onDone,
}: {
  account: Account;
  settings: { upi_id: string; payee_name: string } | null;
  societyName?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(Number(account.outstanding)));
  const [method, setMethod] = useState<"upi" | "cash">("upi");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(societyDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [scan, setScan] = useState<{ state: "idle" | "scanning" | "ok" | "warn" | "block"; text: string }>({ state: "idle", text: "" });

  // UPI IDs look like name@bank; a trailing ".com" etc. makes UPI apps reject the payment.
  const upiId = (settings?.upi_id?.trim() || "").replace(/^(.+@[a-z0-9]+)\.[a-z.]+$/i, "$1");
  const payeeDisplay = settings?.payee_name || societyName || "Society Maintenance";
  const query = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeDisplay,
  )}&am=${encodeURIComponent(Number(amount || 0).toFixed(2))}&cu=INR&tn=${encodeURIComponent(
    `Maintenance ${account.flat_number}`,
  )}`;
  const upiLink = upiId ? `upi://pay?${query}` : "";
  const phonePeLink = upiId ? `phonepe://pay?${query}` : "";

  async function pickProof(f: File | null) {
    setProof(f);
    setPreview(f ? URL.createObjectURL(f) : "");
    if (!f) { setScan({ state: "idle", text: "" }); return; }
    setScan({ state: "scanning", text: "Scanning payment screenshot…" });
    try {
      const { scanPaymentScreenshot } = await import("@/lib/payment-scan");
      const r = await scanPaymentScreenshot(f, { upiId, name: payeeDisplay });
      if (r.utr) setReference(r.utr);
      if (r.date && r.date <= societyDate()) setPaidOn(r.date);
      const [y, m] = societyDate().split("-").map(Number);
      const label = r.month ? new Date(r.month.year, r.month.month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" }) : "";
      if (r.month && (r.month.year !== y || r.month.month !== m)) {
        setScan({ state: "block", text: `This screenshot is from ${label}. Please upload this month's payment screenshot.` });
      } else if (r.failed && !r.success) {
        setScan({ state: "block", text: "This screenshot shows the payment failed or pending. Please upload a successful payment." });
      } else {
        const notes: string[] = [];
        if (!r.utr) notes.push("Transaction ID not found — please type it");
        if (!r.payeeMatch) notes.push("could not confirm it was paid to the society UPI — please check");
        if (!r.month) notes.push("date not readable");
        setScan(notes.length
          ? { state: "warn", text: `Scanned${r.utr ? " • Transaction ID filled" : ""}. Note: ${notes.join("; ")}.` }
          : { state: "ok", text: `✓ Verified for ${label} • Transaction ID auto-filled` });
      }
    } catch {
      setScan({ state: "warn", text: "Could not scan the screenshot. Please type the Transaction ID." });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (method === "upi" && scan.state === "block") { setError(scan.text); return; }
    if (method === "upi" && scan.state === "scanning") { setError("Please wait, the screenshot is still being scanned."); return; }
    if (method === "upi" && !proof) { setError("Please upload the payment screenshot."); return; }
    if (proof && proof.size > 5 * 1024 * 1024) { setError("Screenshot must be under 5 MB."); return; }
    setBusy(true);
    setError("");
    const { error: insertError, paymentId } = await submitPayment({
      flat_id: account.id,
      amount: Number(amount),
      method,
      status: "pending",
      paid_on: paidOn,
      ...(method === "upi" ? { reference: reference.trim() } : {}),
      month_covered: currentMonthLabel(),
    });
    if (insertError) {
      setBusy(false);
      setError(insertError.message);
      return;
    }
    if (method === "upi" && proof && paymentId) {
      const up = await uploadPaymentProof(account.id, paidOn, paymentId, proof);
      if (up.error && !/exists/i.test(up.error.message)) { setBusy(false); setError("Payment saved, but the screenshot could not be uploaded. Please press the button again."); return; }
    }
    setBusy(false);
    onDone();
  }

  return (
    <Modal title="Pay maintenance" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["upi", "cash"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`rounded-2xl px-4 py-2.5 text-sm font-semibold ring-1 ring-border ${method === m ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            {m === "upi" ? "UPI / PhonePe" : "Cash"}
          </button>
        ))}
      </div>
      {method === "cash" ? (
        <Notice tone="ok">
          Give the cash to the Treasurer, then tell us below. It will show as paid once the Treasurer confirms they received it.
        </Notice>
      ) : upiId ? (
        <div className="rounded-2xl bg-muted p-4 ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Pay to this UPI ID</p>
          <p className="font-mono text-lg font-semibold">{upiId}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={upiLink}
              className="inline-flex rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
            >
              Open UPI app
            </a>
            <a
              href={phonePeLink}
              className="inline-flex rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Pay with PhonePe
            </a>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Works on your phone. If the app doesn't open, copy the UPI ID above and pay from any UPI app. After paying, come back and enter the reference number below.
          </p>
        </div>
      ) : (
        <Notice tone="error">
          The committee has not added a UPI ID yet. Please pay in cash for now.
        </Notice>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label={method === "cash" ? "Date you gave the cash" : "Actual payment date"} type="date" required max={societyDate()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        <Field
          label="Amount you paid"
          type="number"
          min={1}
          step="1"
          value={amount}
          required
          onChange={(e) => setAmount(e.target.value)}
        />
        {method === "upi" ? (
          <Field
            label="Transaction ID"
            value={reference}
            required
            placeholder="e.g. T2611231015123456789"
            onChange={(e) => setReference(e.target.value)}
          />
        ) : null}
        {method === "upi" ? (
          <div>
            <p className="mb-1.5 text-sm font-medium">Payment screenshot *</p>
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-muted px-4 py-4 text-sm font-semibold text-primary">
              {proof ? "Change screenshot" : "📷 Upload payment screenshot"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void pickProof(e.target.files?.[0] ?? null); }} />
            </label>
            {scan.state !== "idle" ? <div className="mt-2"><Notice tone={scan.state === "block" || scan.state === "warn" ? "error" : "ok"}>{scan.text}</Notice></div> : null}
            {preview ? <img src={preview} alt="Payment screenshot preview" className="mt-2 max-h-48 rounded-xl ring-1 ring-border" /> : null}
          </div>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy || (method === "upi" && (scan.state === "block" || scan.state === "scanning"))}>
          {busy ? "Saving…" : "I have paid — send for confirmation"}
        </PrimaryButton>
        <p className="text-xs text-muted-foreground">
          If the payment failed or was cancelled, just try again.
        </p>
      </form>
    </Modal>
  );
}

function TenantPanel({ flatId, onSaved }: { flatId: string; onSaved: () => void }) {
  const [occupancy, setOccupancy] = useState<"owner" | "rented">("owner");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    supabase
      .from("flats")
      .select("occupancy, tenant_name, tenant_phone, tenant_email")
      .eq("id", flatId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setOccupancy(data.occupancy === "rented" ? "rented" : "owner");
        setName(data.tenant_name ?? "");
        setPhone(data.tenant_phone ?? "");
        setEmail(data.tenant_email ?? "");
      });
  }, [flatId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    const { error: rpcError } = await supabase.rpc("update_my_flat_tenant", {
      _flat_id: flatId,
      _occupancy: occupancy,
      _tenant_name: name,
      _tenant_phone: phone,
      _tenant_email: email,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else {
      setOk("Saved.");
      onSaved();
    }
  }

  return (
    <Panel>
      <p className="font-display text-xl font-semibold tracking-tight">Tenant Details</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell the committee if your flat is rented. Tenants do not get a login.
      </p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={occupancy === "owner"} onChange={() => setOccupancy("owner")} />
            Owner Occupied
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={occupancy === "rented"} onChange={() => setOccupancy("rented")} />
            Rented
          </label>
        </div>
        {occupancy === "rented" ? (
          <>
            <Field label="Tenant name" value={name} required onChange={(e) => setName(e.target.value)} />
            <Field label="Tenant mobile number" type="tel" value={phone} required onChange={(e) => setPhone(e.target.value)} />
            <Field label="Tenant email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {ok ? <Notice tone="ok">{ok}</Notice> : null}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save tenant details"}
        </PrimaryButton>
      </form>
    </Panel>
  );
}
