import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronDown, Plus, Trash2, Users, Vote as VoteIcon, X } from "lucide-react";

import { Field, Modal, Notice } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/page-loader";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { canSubmitChanges } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/polls")({
  head: () => ({
    meta: [
      { title: "Polls & Voting — NestInLedger" },
      { name: "description", content: "Society polls and voting. One vote per owner-occupied flat." },
      { property: "og:title", content: "Polls & Voting — NestInLedger" },
      { property: "og:description", content: "Society polls and voting. One vote per owner-occupied flat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Polls,
});

type Poll = { id: string; title: string; description: string | null; status: string; expires_at: string | null; created_at: string };
type Option = { id: string; poll_id: string; label: string; sort_order: number };
type Vote = { poll_id: string; option_id: string; flat_id: string };
type Flat = { id: string; flat_number: string; occupancy?: string };
type FlatFull = Flat & { resident_name: string };
type Count = { poll_id: string; option_id: string; votes: number };

const isOpen = (p: Poll) => p.status === "active" && (!p.expires_at || new Date(p.expires_at) > new Date());
const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function Polls() {
  const { role, userId, loading, societyName } = useSessionRole();
  const canManage = canSubmitChanges(role);
  const canSeeVoters = role === "president" || role === "secretary";
  const [eligible, setEligible] = useState(0);
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myFlats, setMyFlats] = useState<Flat[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [allFlats, setAllFlats] = useState<FlatFull[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [expandedVoters, setExpandedVoters] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", options: ["", ""], deadline: "" });

  const refresh = useCallback(async () => {
    const [p, o, v, f, c, af, el] = await Promise.all([
      supabase.from("society_polls").select("*").order("created_at", { ascending: false }),
      supabase.from("society_poll_options").select("*").order("sort_order"),
      supabase.from("society_poll_votes").select("poll_id, option_id, flat_id"),
      userId ? supabase.from("flats").select("id, flat_number, occupancy").eq("resident_user_id", userId) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("poll_vote_counts"),
      canSeeVoters ? supabase.from("flats").select("id, flat_number, resident_name").eq("occupancy", "owner").order("flat_number") : Promise.resolve({ data: [], error: null }),
      supabase.rpc("poll_eligible_flats"),
    ]);
    const e = p.error ?? o.error ?? v.error ?? c.error;
    if (e) { setErr(e.message); setPolls([]); return; }
    setPolls(p.data as Poll[]); setOptions(o.data as Option[]); setVotes(v.data as Vote[]); setMyFlats(((f.data ?? []) as Flat[]).filter((x) => x.occupancy === "owner"));
    setEligible(Number(el.data ?? 0));
    setCounts((c.data ?? []) as Count[]); setAllFlats((af.data ?? []) as FlatFull[]);
  }, [userId, canSeeVoters]);
  useEffect(() => { if (!loading) refresh(); }, [loading, refresh]);

  async function vote(poll: Poll) {
    const opt = choice[poll.id];
    const flat = myFlats.find((fl) => !votes.some((v) => v.poll_id === poll.id && v.flat_id === fl.id));
    if (!opt || !flat) return;
    setErr(""); setMsg(""); setBusyId(poll.id);
    const { error } = await supabase.rpc("cast_poll_vote", { _poll: poll.id, _option: opt, _flat: flat.id });
    setBusyId(null);
    if (error) { setErr(error.message); return; }
    setMsg(`Vote saved for flat ${flat.flat_number}.`); refresh();
  }

  async function create() {
    const opts = form.options.map((s) => s.trim()).filter(Boolean);
    if (!form.title.trim()) { setErr("Please write the question."); return; }
    if (opts.length < 2) { setErr("Please give at least 2 choices."); return; }
    setBusyId("create"); setErr("");
    const { data, error } = await supabase.from("society_polls").insert({
      title: form.title.trim(), description: form.description.trim() || null,
      expires_at: form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : null,
    }).select("id").single();
    if (error || !data) { setBusyId(null); setErr(error?.message ?? "Could not create poll."); return; }
    const { error: e2 } = await supabase.from("society_poll_options").insert(opts.map((label, i) => ({ poll_id: data.id, label, sort_order: i })));
    setBusyId(null);
    if (e2) { setErr(e2.message); return; }
    setCreating(false); setForm({ title: "", description: "", options: ["", ""], deadline: "" });
    setMsg("Poll created."); refresh();
  }

  async function close(p: Poll) {
    setBusyId(p.id);
    const { error } = await supabase.from("society_polls").update({ status: "closed" }).eq("id", p.id);
    setBusyId(null);
    if (error) setErr(error.message); else refresh();
  }
  async function remove(p: Poll) {
    if (!window.confirm(`Delete poll "${p.title}"? This cannot be undone.`)) return;
    setBusyId(p.id);
    const { error } = await supabase.from("society_polls").delete().eq("id", p.id);
    setBusyId(null);
    if (error) setErr(error.message); else refresh();
  }

  if (loading || polls === null) return <PageLoader title="Loading Polls…" subtitle="Fetching society votes" />;

  const open = polls.filter(isOpen);
  const past = polls.filter((p) => !isOpen(p));

  function PollCard({ p }: { p: Poll }) {
    const opts = options.filter((o) => o.poll_id === p.id);
    const pv = votes.filter((v) => v.poll_id === p.id);
    const pc = counts.filter((c) => c.poll_id === p.id);
    const total = pc.reduce((s, c) => s + Number(c.votes), 0);
    const turnoutPct = eligible > 0 ? Math.min(100, Math.round((total / eligible) * 100)) : 0;
    const myVote = pv.find((v) => myFlats.some((f) => f.id === v.flat_id));
    const active = isOpen(p);
    const canVote = active && myFlats.some((f) => !pv.some((v) => v.flat_id === f.id));
    const showResults = !canVote || canManage;
    const topVotes = Math.max(0, ...opts.map((o) => Number(pc.find((c) => c.option_id === o.id)?.votes ?? 0)));
    const votersOpen = Boolean(expandedVoters[p.id]);

    return (
      <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-shadow hover:shadow-md">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  <span className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                  {active ? "Open" : "Closed"}
                </span>
                {myVote ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <CheckCircle2 className="size-3.5" />Voted
                  </span>
                ) : null}
                {p.expires_at ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {active ? `Ends ${fmt(p.expires_at)}` : `Ended ${fmt(p.expires_at)}`}
                  </span>
                ) : null}
              </div>
              <h3 className="font-display text-lg font-semibold leading-snug text-foreground sm:text-xl">{p.title}</h3>
              {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-2">
                {active ? <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => close(p)}>Close poll</Button> : null}
                <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete poll" disabled={busyId === p.id} onClick={() => remove(p)}><Trash2 className="size-4" /></Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                <Users className="size-3.5" />
                {total} of {eligible} owner {eligible === 1 ? "flat" : "flats"} voted
              </span>
              <span className="font-semibold tabular-nums text-foreground">{turnoutPct}% turnout</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/80">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${turnoutPct}%` }} />
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {opts.map((o) => {
              const n = Number(pc.find((c) => c.option_id === o.id)?.votes ?? 0);
              const pct = total ? Math.round((n / total) * 100) : 0;
              const selected = choice[p.id] === o.id;
              const isMine = myVote?.option_id === o.id;
              const isLeading = total > 0 && n === topVotes && showResults;

              if (canVote && !showResults) {
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${selected ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary" : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"}`}
                  >
                    <input type="radio" name={p.id} className="size-4 accent-primary" checked={selected} onChange={() => setChoice({ ...choice, [p.id]: o.id })} />
                    <span className="flex-1">{o.label}</span>
                  </label>
                );
              }
              return (
                <div
                  key={o.id}
                  onClick={canVote ? () => setChoice({ ...choice, [p.id]: o.id }) : undefined}
                  className={`relative overflow-hidden rounded-xl border px-4 py-3 transition ${canVote ? "cursor-pointer" : ""} ${selected ? "border-primary ring-1 ring-primary" : isMine ? "border-primary/60 bg-primary/5" : "border-border bg-background"}`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${isLeading ? "bg-primary/15" : "bg-muted/70"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {canVote ? <input type="radio" name={p.id} className="size-4 shrink-0 accent-primary" checked={selected} onChange={() => setChoice({ ...choice, [p.id]: o.id })} /> : null}
                      <span className={`truncate ${isMine || isLeading ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>{o.label}</span>
                      {isMine ? <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Your vote</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {pct}% <span className="font-normal text-muted-foreground">({n})</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {canVote ? (
            <div className="mt-4 flex justify-end">
              <Button disabled={!choice[p.id] || busyId === p.id} onClick={() => vote(p)}>
                <VoteIcon className="size-4" />
                {busyId === p.id ? "Saving…" : "Cast vote"}
              </Button>
            </div>
          ) : null}
        </div>

        {canSeeVoters && allFlats.length ? (
          <div className="border-t border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setExpandedVoters({ ...expandedVoters, [p.id]: !votersOpen })}
              className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:px-6"
            >
              <span>Voter breakdown · President &amp; Secretary only</span>
              <ChevronDown className={`size-4 transition-transform ${votersOpen ? "rotate-180" : ""}`} />
            </button>
            {votersOpen ? (
              <div className="divide-y divide-border border-t border-border bg-card/60 px-5 text-sm sm:px-6">
                {allFlats.map((fl) => {
                  const v = pv.find((x) => x.flat_id === fl.id);
                  const label = v ? opts.find((o) => o.id === v.option_id)?.label : null;
                  return (
                    <div key={fl.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground">Flat {fl.flat_number}</span>
                        <span className="ml-2 text-muted-foreground">{fl.resident_name}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${label ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {label ?? "Not voted"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{societyName ?? "Your apartment"}</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">Polls &amp; Voting</h1>
            <p className="mt-1 text-sm text-muted-foreground">One vote per owner-occupied flat. Rented flats cannot vote.</p>
          </div>
          {canManage ? (
            <Button onClick={() => { setErr(""); setCreating(true); }}>
              <Plus className="size-4" />New poll
            </Button>
          ) : null}
        </header>

        <Notice tone="error">{err}</Notice>
        <Notice tone="ok">{msg}</Notice>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Open polls</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">{open.length}</span>
          </div>
          {open.length ? (
            <div className="space-y-4">{open.map((p) => <PollCard key={p.id} p={p} />)}</div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
              <VoteIcon className="mx-auto size-9 text-muted-foreground/60" />
              <p className="mt-3 font-medium text-foreground">No open polls right now</p>
              <p className="mt-1 text-sm text-muted-foreground">When the committee starts a vote, it will appear here.</p>
              {canManage ? <Button variant="outline" className="mt-4" onClick={() => { setErr(""); setCreating(true); }}><Plus className="size-4" />Create first poll</Button> : null}
            </div>
          )}
        </section>

        {past.length ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-muted-foreground">Past results</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{past.length}</span>
            </div>
            <div className="space-y-4">{past.map((p) => <PollCard key={p.id} p={p} />)}</div>
          </section>
        ) : null}

        {creating ? (
          <Modal title="New poll" onClose={() => setCreating(false)}>
            <div className="space-y-4">
              <Field label="Question" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Should we upgrade the CCTV cameras?" />
              <Field label="Details (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add context or cost estimate if helpful" />
              <div className="space-y-2.5">
                {form.options.map((o, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Field label={`Choice ${i + 1}`} value={o} onChange={(e) => { const a = [...form.options]; a[i] = e.target.value; setForm({ ...form, options: a }); }} />
                    </div>
                    {form.options.length > 2 ? (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove choice ${i + 1}`} onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })}>
                        <X className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {form.options.length < 4 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                    <Plus className="size-3.5" />Add choice
                  </Button>
                ) : null}
              </div>
              <Field label="Last date (optional)" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              <Notice tone="error">{err}</Notice>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button disabled={busyId === "create"} onClick={create}>{busyId === "create" ? "Creating…" : "Create poll"}</Button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </main>
  );
}
