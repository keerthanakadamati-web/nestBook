import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  flatId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(6),
});

export const createResidentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: permissionError } = await context.supabase
      .rpc("has_permission", { _permission: "roles.manage" });

    if (permissionError || !allowed) {
      throw new Error("Only committee admins can create resident logins.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // If this owner already has a login, link this flat to the same login.
    let residentId: string | null = null;
    for (let page = 1; page <= 20 && !residentId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) residentId = found.id;
      if (list.users.length < 200) break;
    }

    let linkedExisting = false;
    if (residentId) {
      linkedExisting = true;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        const msg = createError?.message ?? "";
        if (/weak|easy to guess|pwned/i.test(msg)) {
          return {
            ok: false as const,
            error:
              "This password is too common. Please use a stronger one, e.g. mix of letters, numbers and a symbol like Flat#A101-2026.",
          };
        }
        return { ok: false as const, error: msg || "Could not create the resident login." };
      }
      residentId = created.user.id;
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: residentId, role: "resident" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleError) throw new Error(roleError.message);

    const { error: linkError } = await supabaseAdmin
      .from("flats")
      .update({ resident_user_id: residentId })
      .eq("id", data.flatId);
    if (linkError) throw new Error(linkError.message);

    return { ok: true as const, email, linkedExisting };
  });

async function requireRoleManager(context: { supabase: { rpc: (n: string, a: object) => PromiseLike<{ data: unknown; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("has_permission", { _permission: "roles.manage" });
  if (error || !data) throw new Error("Only committee admins can manage owner logins.");
}

export const getResidentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ flatId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireRoleManager(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: flat } = await supabaseAdmin.from("flats").select("resident_user_id").eq("id", data.flatId).maybeSingle();
    if (!flat?.resident_user_id) return { email: null, otherFlats: [] as string[] };
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(flat.resident_user_id);
    const { data: others } = await supabaseAdmin.from("flats").select("flat_number").eq("resident_user_id", flat.resident_user_id).neq("id", data.flatId);
    return { email: u?.user?.email ?? null, otherFlats: (others ?? []).map((f) => f.flat_number) };
  });

export const updateResidentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    flatId: z.string().uuid(),
    action: z.enum(["email", "password", "unlink"]),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await requireRoleManager(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: flat } = await supabaseAdmin.from("flats").select("resident_user_id").eq("id", data.flatId).maybeSingle();
    const userId = flat?.resident_user_id;
    if (!userId) return { ok: false as const, error: "This flat has no login linked." };
    const { data: committee } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).neq("role", "resident");
    if (data.action !== "unlink" && (committee ?? []).length) return { ok: false as const, error: "This login belongs to a committee member. They can change it from their own account." };
    if (data.action === "unlink") {
      const { error } = await supabaseAdmin.from("flats").update({ resident_user_id: null }).eq("id", data.flatId);
      return error ? { ok: false as const, error: error.message } : { ok: true as const };
    }
    const attrs = data.action === "email"
      ? { email: (data.email ?? "").trim().toLowerCase(), email_confirm: true }
      : { password: data.password ?? "" };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, attrs);
    if (error) {
      const msg = error.message;
      if (/already|exists|registered/i.test(msg)) return { ok: false as const, error: "Another login already uses this email." };
      if (/weak|easy to guess|pwned/i.test(msg)) return { ok: false as const, error: "This password is too common. Please use a stronger one." };
      return { ok: false as const, error: msg };
    }
    return { ok: true as const };
  });


export const approveFlatRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: reg, error: regError } = await context.supabase
      .from("flat_registrations").select("flat_number, mobile, owner_email, society_id").eq("id", data.id).maybeSingle();
    if (regError || !reg) throw new Error("Submission not found.");
    const { error: decideError } = await context.supabase.rpc("decide_flat_registration", { _id: data.id, _import: true });
    if (decideError) throw new Error(decideError.message);
    if (!reg.owner_email) return { ok: true as const, login: "no-email" as const };
    const { data: flat } = await context.supabase.from("flats").select("id, resident_user_id")
      .eq("society_id", reg.society_id).ilike("flat_number", reg.flat_number.trim()).maybeSingle();
    if (!flat) return { ok: true as const, login: "failed" as const, error: "Flat added, but could not find it to create the login." };
    if (flat.resident_user_id) return { ok: true as const, login: "exists" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = reg.owner_email.toLowerCase();
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      userId = list.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (list.users.length < 200) break;
    }
    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password: reg.mobile, email_confirm: true });
      if (error || !created?.user) return { ok: true as const, login: "failed" as const, error: /weak|guess|pwned/i.test(error?.message ?? "") ? "Flat added, but the mobile number is too common to use as a password. Use Create login to set another password." : `Flat added, but login could not be created: ${error?.message ?? "unknown error"}` };
      userId = created.user.id;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "resident" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    const { error: linkError } = await supabaseAdmin.from("flats").update({ resident_user_id: userId }).eq("id", flat.id);
    if (linkError) return { ok: true as const, login: "failed" as const, error: "Flat added, but login could not be linked." };
    return { ok: true as const, login: "created" as const, email };
  });
