import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findRegisteredUser, normalizeEmail } from "@/lib/account-actions";

const schema = z.object({
  societyId: z.string().uuid(),
  role: z.enum(["president", "secretary", "treasurer"]),
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

export const saveSocietyCommitteeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (admin.error || !admin.data) return { ok: false as const, error: "Only Admin can set apartment committees." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = normalizeEmail(data.email);
    const society = await supabaseAdmin.from("societies").select("id, code").eq("id", data.societyId).single();
    if (society.error) return { ok: false as const, error: "Apartment not found." };

    let userId = await findRegisteredUser(email, async (page) => {
      const r = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      return { users: r.data.users, error: Boolean(r.error) };
    });
    if (!userId) {
      if (!data.password) return { ok: false as const, error: "This email has no login yet. Please enter a password (8+ characters)." };
      const created = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true });
      if (created.error || !created.data.user) {
        const msg = created.error?.message ?? "";
        return { ok: false as const, error: /weak|guess|pwned/i.test(msg) ? "This password is too common. Please use a stronger one." : msg || "Could not create the login." };
      }
      userId = created.data.user.id;
    }

    const saved = await supabaseAdmin.from("society_committee").upsert(
      { society_id: data.societyId, role: data.role, user_id: userId, email, full_name: data.fullName },
      { onConflict: "society_id,role" },
    );
    if (saved.error) return { ok: false as const, error: saved.error.message };
    await supabaseAdmin.from("profiles").upsert({ user_id: userId, full_name: data.fullName }, { onConflict: "user_id" });

    // Each apartment's records are separated in the database, so the role is safe to activate everywhere.
    const r = await context.supabase.rpc("set_committee_role", { _user_id: userId, _role: data.role });
    if (r.error) return { ok: false as const, error: r.error.message };
    return { ok: true as const, active: true };
  });
