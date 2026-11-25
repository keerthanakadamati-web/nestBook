import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Website developer (Admin) who receives technical support requests.
const SUPPORT_EMAIL = "keerthyrao2000@gmail.com";

export const notifySupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase.from("support_tickets").select("*").eq("id", data.id).eq("created_by", context.userId).maybeSingle();
    if (error || !t) return { ok: false as const, error: "Request not found." };
    let link = "";
    if (t.image_path) {
      const s = await context.supabase.storage.from("support-screenshots").createSignedUrl(t.image_path, 60 * 60 * 24 * 7);
      link = s.data?.signedUrl ?? "";
    }
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("society-notice", SUPPORT_EMAIL, {
        idempotencyKey: `support-${t.id}`,
        templateData: {
          subject: `NestInLedger – Technical support: ${t.category}`,
          body: `New technical support request\n\nFrom: ${t.created_email ?? "Committee member"}\nType: ${t.category}\nDate: ${new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\nProblem:\n${t.description}\n\n${link ? `Screenshot (link valid 7 days):\n${link}` : "No screenshot attached."}\n\nOpen NestInLedger → Technical Support to mark it resolved.`,
        },
      });
      return { ok: true as const };
    } catch (e) {
      console.error("support email failed", e);
      return { ok: false as const, error: "Request saved, but the email could not be sent." };
    }
  });
