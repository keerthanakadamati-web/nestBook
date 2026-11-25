import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/hooks/payment-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyHookToken, ownerEmail, sendGmail, inr, societyNameForFlat } = await import("@/lib/email-hooks.server");
        if (!(await verifyHookToken(request))) return new Response("Unauthorized", { status: 401 });
        const parsed = z.object({ payment_id: z.string().uuid() }).safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          return Response.json({ error: "Invalid payment" }, { status: 400 });
        }
        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const configuration = await supabaseAdmin.from("society_settings").select("payment_notifications").eq("id", true).single();
        if (configuration.error) return Response.json({ error: "Notification settings unavailable" }, { status: 500 });
        if (!configuration.data.payment_notifications) return Response.json({ skipped: "payment notifications disabled" });

        // One email per payment: the insert fails if this payment was already handled.
        const { error: claimErr } = await supabaseAdmin.from("payment_emails").insert({ payment_id: body.payment_id });
        if (claimErr) return Response.json({ skipped: "already handled" });

        const { data: p } = await supabaseAdmin
          .from("payments")
          .select("amount, method, status, paid_on, month_covered, receipt_no, flat_id")
          .eq("id", body.payment_id)
          .maybeSingle();
        const { data: f } = p
          ? await supabaseAdmin.from("flat_accounts").select("flat_number, resident_name, resident_user_id, outstanding").eq("id", p.flat_id).maybeSingle()
          : { data: null };
        const to = f ? await ownerEmail(f.resident_user_id) : null;
        let err: string | null;
        if (!p || p.status !== "confirmed") err = "Payment not confirmed";
        else if (!f) err = "Flat not found";
        else if (!to) err = "No owner login email linked to this flat";
        else {
          const socName = await societyNameForFlat(p.flat_id);
          err = await sendGmail(
            to,
            `NestInLedger – ${socName}: Payment received — Flat ${f.flat_number} — ${inr(p.amount)}`,
            [
              `Dear ${f.resident_name},`,
              "",
              "Thank you. We have received your maintenance payment.",
              "",
              `Flat number: ${f.flat_number}`,
              `Amount: ${inr(p.amount)}`,
              `Payment method: ${p.method === "upi" ? "UPI" : "Cash"}`,
              `Payment date: ${p.paid_on}`,
              `Month covered: ${p.month_covered}`,
              `Receipt number: ${p.receipt_no}`,
              `Amount still due: ${inr(f.outstanding)}`,
              "",
              "You can download your receipt after signing in to NestInLedger.",
              "",
              `${socName} Committee`,
            ].join("\n"),
            socName,
          );
        }
        await supabaseAdmin
          .from("payment_emails")
          .update({
            email_status: err === null ? "sent" : "failed",
            email_error: err,
            email_to: to,
            email_sent_at: err === null ? new Date().toISOString() : null,
          })
          .eq("payment_id", body.payment_id);
        return Response.json({ sent: err === null });
      },
    },
  },
});
