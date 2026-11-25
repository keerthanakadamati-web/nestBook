import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AnnouncementCard, CATEGORIES, loadAnnouncements, type Announcement } from "@/components/announcements-ui";
import { Field, Modal, Notice, Panel, PrimaryButton, QuietButton } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";
import { canSubmitChanges } from "@/lib/permissions";
import { saveAdministrativeChange } from "@/lib/approval";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — NestInLedger" },
      { name: "description", content: "Notices from your apartment committee." },
      { property: "og:title", content: "Announcements — NestInLedger" },
      { property: "og:description", content: "Notices from your apartment committee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Announcements,
});

function Announcements() {
  const { role, loading } = useSessionRole();
  const isAdmin = canSubmitChanges(role);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);

  const refresh = useCallback(async () => {
    setItems(await loadAnnouncements(!isAdmin));
  }, [isAdmin]);

  useEffect(() => {
    if (!loading) refresh();
  }, [loading, refresh]);

  async function remove(a: Announcement) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    const result = await saveAdministrativeChange({ module: "announcements", action: "delete", key: a.id, values: {} }, () => supabase.from("announcements").delete().eq("id", a.id));
    setMessage(result.error?.message ?? (result.pending ? "Deletion submitted for President approval." : "Announcement deleted."));
    refresh();
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-4xl font-bold tracking-tight">Announcements</h1>
          {isAdmin ? <PrimaryButton onClick={() => setEditing("new")}>New announcement</PrimaryButton> : null}
        </div>
        {message ? <Notice tone="ok">{message}</Notice> : null}
        {items.length === 0 ? (
          <Panel className="mt-8">
            <p className="text-muted-foreground">No announcements yet.</p>
          </Panel>
        ) : (
          items.map((a) => (
            <Panel key={a.id} className="mt-6">
              <AnnouncementCard a={a} />
              {isAdmin ? (
                <div className="mt-4 flex gap-2">
                  <QuietButton onClick={() => setEditing(a)}>Edit</QuietButton>
                  <QuietButton onClick={() => remove(a)}>Delete</QuietButton>
                </div>
              ) : null}
            </Panel>
          ))
        )}
      </div>
      {isAdmin && editing ? (
        <AnnouncementForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function AnnouncementForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.event_date ?? today);
  const [time, setTime] = useState(initial?.event_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [expires, setExpires] = useState(initial?.expires_on ?? "");
  const [published, setPublished] = useState(initial?.published ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Please enter a title.");
    setSaving(true);
    setError("");
    const row = {
      title: title.trim(),
      category,
      description: description.trim(),
      event_date: date,
      event_time: time || null,
      location: location.trim() || null,
      expires_on: expires || null,
      published,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await saveAdministrativeChange({ module: "announcements", action: initial ? "update" : "create", key: initial?.id, values: row }, () => initial
      ? supabase.from("announcements").update(row).eq("id", initial.id)
      : supabase.from("announcements").insert(row));
    setSaving(false);
    if (err) return setError("Could not save. Please try again.");
    onSaved();
  }

  const inputClass =
    "mt-1.5 w-full rounded-2xl bg-muted px-4 py-3 text-base text-foreground ring-1 ring-input outline-none focus:ring-2 focus:ring-ring";

  return (
    <Modal title={initial ? "Edit announcement" : "New announcement"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="block">
          <span className="text-sm font-medium text-muted-foreground">Category</span>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-muted-foreground">Description</span>
          <textarea className={inputClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Field label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Field label="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Field
          label="Expiry date (optional)"
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          hint="Owners stop seeing it after this date."
        />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publish (owners can see it)
        </label>
        <Notice tone="error">{error}</Notice>
        <PrimaryButton type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save announcement"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
