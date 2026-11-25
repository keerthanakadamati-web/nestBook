import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Passwords are supplied only by the President at execution and never stored in proposals.
export const approveOwnerLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), comment: z.string(), password: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: president } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "president" });
    if (!president) return { ok: false, error: "Only the President can approve." };
    const { data: proposal, error } = await context.supabase.from("change_proposals").select("*").eq("id", data.id).single();
    if (error || !proposal || proposal.status !== "pending" || proposal.action !== "create_login" || proposal.submitted_by === context.userId) return { ok: false, error: "This login request cannot be approved." };
    const values = proposal.proposed_values;
    if (!values || typeof values !== "object" || Array.isArray(values) || typeof values['email'] !== "string") return { ok: false, error: "Missing requested email." };
    const email = values['email'].trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string | undefined;
    let createdId: string | undefined;
    for (let page = 1; ; page++) {
      const list = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (list.error) return { ok: false, error: "Could not check existing owner accounts." };
      userId = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (userId || list.data.users.length < 200) break;
    }
    if (!userId) {
      if (data.password.length < 8) return { ok: false, error: "Enter a strong temporary password of at least 8 characters for a new owner." };
      const created = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true });
      if (created.error || !created.data.user) return { ok: false, error: "Could not create the owner login. Check the email and use a stronger password." };
      userId = created.data.user.id;
      createdId = userId;
    }
    const result = await context.supabase.rpc("decide_change", { _id: data.id, _approve: true, _comment: data.comment, _resolved_user: userId });
    if (result.error) {
      if (createdId) {
        // A concurrent approval may already have linked the new account. Never
        // remove an account now referenced by an approved proposal/live record.
        const [flatLinks, roleLinks, decision] = await Promise.all([
          supabaseAdmin.from("flats").select("id").eq("resident_user_id", createdId).limit(1),
          supabaseAdmin.from("user_roles").select("id").eq("user_id", createdId).limit(1),
          supabaseAdmin.from("change_proposals").select("status").eq("id", data.id).single(),
        ]);
        if (!flatLinks.error && !roleLinks.error && !decision.error && !flatLinks.data.length && !roleLinks.data.length && decision.data.status !== "approved") {
          await supabaseAdmin.auth.admin.deleteUser(createdId);
        }
      }
      return { ok: false, error: result.error.message };
    }
    return { ok: true, error: "" };
  });