import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
    const roles = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (access.error || roles.error) throw new Error("Could not check complaint access.");
    if (!access.data && roles.data.some((r) => r.role === "treasurer")) return { allowed: false, committee: false, complaints: [], events: [], proposals: [], flats: [], flatNames: {} as Record<string, string>, people: {} as Record<string, string>, notifications: [], photos: [] };
    const [complaints, events, flats, proposals, notifications] = await Promise.all([
      context.supabase.from("complaints").select("*").order("submitted_at", { ascending: false }),
      context.supabase.from("complaint_events").select("*").order("occurred_at"),
      context.supabase.from("flats").select("id, flat_number"),
      access.data ? context.supabase.from("change_proposals").select("*").eq("module", "complaints").order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      context.supabase.from("complaint_notifications").select("*").order("created_at", { ascending: false }),
    ]);
    if (complaints.error || events.error || flats.error || proposals.error || notifications.error) throw new Error("Could not load complaints. Please try again.");
    const photos: { complaintId: string; url: string; name: string }[] = [];
    for (const complaint of complaints.data) {
      const prefix = `${complaint.id}/${complaint.owner_id}`;
      const files = await context.supabase.storage.from("complaint-photos").list(prefix);
      if (files.error) throw new Error("Could not load complaint photos.");
      for (const file of files.data) {
        const signed = await context.supabase.storage.from("complaint-photos").createSignedUrl(`${prefix}/${file.name}`, 300);
        if (signed.error) throw new Error("Could not open a complaint photo.");
        photos.push({ complaintId: complaint.id, name: file.name, url: signed.data.signedUrl });
      }
    }
    // Friendly names (name, flat numbers, committee role) for people shown in complaints and history.
    const ids = [...new Set([...complaints.data.map((c) => c.owner_id), ...events.data.map((e) => e.actor_id), ...(proposals.data ?? []).map((p) => p.submitted_by)])];
    const people: Record<string, string> = {};
    const flatNames: Record<string, string> = {};
    if (ids.length || complaints.data.length) {
      const [profiles, ownedFlats, roles, allFlats] = await Promise.all([
        context.supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
        context.supabase.from("flats").select("flat_number, resident_name, resident_user_id").in("resident_user_id", ids),
        context.supabase.from("user_roles").select("user_id, role").in("user_id", ids),
        context.supabase.from("flats").select("id, flat_number").in("id", [...new Set(complaints.data.map((c) => c.flat_id))]),
      ]);
      const roleName: Record<string, string> = { admin: "Admin", president: "President", secretary: "Secretary", treasurer: "Treasurer" };
      for (const f of allFlats.data ?? []) flatNames[f.id] = f.flat_number;
      for (const id of ids) {
        const own = (ownedFlats.data ?? []).filter((f) => f.resident_user_id === id);
        const name = (profiles.data ?? []).find((p) => p.user_id === id)?.full_name?.trim() || own[0]?.resident_name || "";
        const role = (roles.data ?? []).filter((r) => r.user_id === id).map((r) => roleName[r.role]).find(Boolean) ?? (own.length ? "Owner" : undefined);
        const flatsText = own.length ? `Flat ${own.map((f) => f.flat_number).join(", ")}` : "";
        people[id] = [name || role || "Member", [role, flatsText].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
      }
    }
    return { allowed: true, committee: !!access.data, complaints: complaints.data, events: events.data, flats: flats.data, flatNames, people, proposals: proposals.data ?? [], notifications: notifications.data, photos };
  });