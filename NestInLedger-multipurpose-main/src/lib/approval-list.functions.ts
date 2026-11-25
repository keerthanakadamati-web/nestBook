import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listApprovalHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError) throw new Error("Could not check history access.");
    if (!roles?.some(({ role }) => ["admin", "president", "secretary", "treasurer"].includes(role))) return { allowed: false, proposals: [], audit: [], names: {} as Record<string, string> };
    const [{ data: proposals, error }, { data: audit, error: auditError }] = await Promise.all([
      context.supabase.from("change_proposals").select("*").order("submitted_at", { ascending: false }),
      context.supabase.from("change_audit").select("*").order("occurred_at"),
    ]);
    if (error || auditError) throw new Error("Could not load approval history.");
    // Readable labels for every ID shown (people, flats, complaints), so the page never shows raw codes.
    const ids = new Set<string>();
    const collect = (v: unknown) => { if (typeof v === "string" && UUID.test(v)) ids.add(v); else if (v && typeof v === "object") Object.values(v).forEach(collect); };
    for (const p of proposals ?? []) { collect(p.submitted_by); collect(p.reviewed_by); collect(p.record_key); collect(p.previous_values); collect(p.proposed_values); }
    for (const a of audit ?? []) collect(a.actor_id);
    const names: Record<string, string> = {};
    if (ids.size) {
      const list = [...ids];
      const [profiles, owned, userRoles, flats, complaints] = await Promise.all([
        context.supabase.from("profiles").select("user_id, full_name").in("user_id", list),
        context.supabase.from("flats").select("flat_number, resident_name, resident_user_id").in("resident_user_id", list),
        context.supabase.from("user_roles").select("user_id, role").in("user_id", list),
        context.supabase.from("flats").select("id, flat_number").in("id", list),
        context.supabase.from("complaints").select("id, title, flat_id").in("id", list),
      ]);
      const roleName: Record<string, string> = { admin: "Admin", president: "President", secretary: "Secretary", treasurer: "Treasurer" };
      for (const f of flats.data ?? []) names[f.id] = `Flat ${f.flat_number}`;
      for (const c of complaints.data ?? []) names[c.id] = `Complaint: ${c.title}`;
      const userIds = new Set([...(profiles.data ?? []).map((p) => p.user_id), ...(owned.data ?? []).map((f) => f.resident_user_id as string), ...(userRoles.data ?? []).map((r) => r.user_id)]);
      for (const id of userIds) {
        const own = (owned.data ?? []).filter((f) => f.resident_user_id === id);
        const name = (profiles.data ?? []).find((p) => p.user_id === id)?.full_name?.trim() || own[0]?.resident_name || "Member";
        const role = (userRoles.data ?? []).filter((r) => r.user_id === id).map((r) => roleName[r.role]).find(Boolean) ?? (own.length ? "Owner" : "");
        const flatsText = own.length ? `Flat ${own.map((f) => f.flat_number).join(", ")}` : "";
        names[id] = [name, [role, flatsText].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
      }
    }
    return { allowed: true, proposals: proposals ?? [], audit: audit ?? [], names };
  });
