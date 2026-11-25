import { supabase } from "@/integrations/supabase/client";
import { shortDate } from "@/lib/format";

export const CATEGORIES = [
  "Meetings",
  "Maintenance & Repairs",
  "Important Notices",
  "Events",
  "Urgent Notices",
] as const;

export type Announcement = {
  id: string;
  title: string;
  category: string;
  description: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  expires_on: string | null;
  published: boolean;
  created_at: string;
};

/** Newest first. RLS limits residents to published, not-expired rows. */
export async function loadAnnouncements(onlyPublished: boolean, limit?: number) {
  let q = supabase
    .from("announcements")
    .select("*")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (onlyPublished) q = q.eq("published", true);
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return (data ?? []) as Announcement[];
}

export function AnnouncementCard({ a }: { a: Announcement }) {
  const urgent = a.category === "Urgent Notices";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            urgent
              ? "rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive"
              : "rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          }
        >
          {a.category}
        </span>
        {!a.published ? (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Draft</span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-lg font-semibold tracking-tight">{a.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {shortDate(a.event_date)}
        {a.event_time ? ` · ${a.event_time.slice(0, 5)}` : ""}
        {a.location ? ` · ${a.location}` : ""}
      </p>
      {a.description ? <p className="mt-2 whitespace-pre-line text-sm">{a.description}</p> : null}
      {a.expires_on ? (
        <p className="mt-2 text-xs text-muted-foreground">Shown until {shortDate(a.expires_on)}</p>
      ) : null}
    </div>
  );
}
