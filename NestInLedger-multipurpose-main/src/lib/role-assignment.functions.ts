import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assignableRoles, findRegisteredUser, normalizeEmail } from "@/lib/account-actions";

export const assignRoleByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email(), role: z.enum(assignableRoles) }).parse(input))
  .handler(async ({ data, context }) => {
    try {
      const [manage, secretary] = await Promise.all([
        context.supabase.rpc("has_permission", { _permission: "roles.manage" }),
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: "secretary" }),
      ]);
      if (manage.error || secretary.error || (!manage.data && !secretary.data)) return { ok: false, pending: false, error: "You do not have permission to manage roles." };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const userId = await findRegisteredUser(normalizeEmail(data.email), async (page) => {
        const result = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        return { users: result.data.users, error: Boolean(result.error) };
      });
      if (!userId) return { ok: false, pending: false, error: "No registered account matches this email address." };
      const pending = Boolean(secretary.data);
      const result = pending
        ? await context.supabase.rpc("submit_change", { _module: "user_roles", _action: "set_role", _key: userId, _values: { role: data.role } })
        : await context.supabase.rpc("set_committee_role", { _user_id: userId, _role: data.role });
      return { ok: !result.error, pending, error: result.error?.message ?? "" };
    } catch { return { ok: false, pending: false, error: "Could not change this role. Please try again." }; }
  });