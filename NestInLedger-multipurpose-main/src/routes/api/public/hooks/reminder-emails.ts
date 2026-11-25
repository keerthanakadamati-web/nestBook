import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/hooks/reminder-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyHookToken, ownerEmail, sendGmail, inr, societyNameForFlat } = await import("@/lib/email-hooks.server");
        if (!(await verifyHookToken(request))) return new Response("Unauthorized", { status: 401 });
        const body = z.object({ run_id: z.string().uuid().optional(), scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(await request.json().catch(() => ({})));
        if (!body.success) return Response.json({ error: "Invalid reminder request" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const configuration = await supabaseAdmin.from("society_settings").select("reminders_enabled,reminder_start_day,reminder_time,reminder_timezone,upi_id,payee_name").eq("id", true).single();
        if (configuration.error) return Response.json({ error: "Reminder settings unavailable" }, { status: 500 });
        const settings = configuration.data;
        const local = new Intl.DateTimeFormat("en-CA", { timeZone: settings.reminder_timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
        const part = (key: string) => local.find((p) => p.type === key)?.value ?? "";
        const today = `${part("year")}-${part("month")}-${part("day")}`;
        const runId = body.data.run_id;
        const finish = async (status: string, sent: number, failed: number, error: string | null = null) => {
          if (!runId) return;
          await supabaseAdmin.from("reminder_runs").update({ status, sent, failed, error, finished_at: new Date().toISOString() }).eq("id", runId).eq("run_date", body.data.scheduled_date ?? today);
        };
        if (!settings.reminders_enabled || Number(part("day")) < settings.reminder_start_day || `${part("hour")}:${part("minute")}` < settings.reminder_time.slice(0, 5) || body.data.scheduled_date && body.data.scheduled_date !== today) {
          await finish("skipped", 0, 0, "Disabled or outside the saved reminder window");
          return Response.json({ skipped: "outside reminder window" });
        }

        // Claim today's unsent reminders atomically so no flat is emailed twice.
        const { data: claimed, error } = await supabaseAdmin
          .from("maintenance_reminders")
          .update({ email_status: "sending" })
          .eq("reminder_date", today)
          .is("email_status", null)
          .select("id, flat_id");
        if (error) { await finish("failed", 0, 0, "Could not claim reminders"); return Response.json({ error: error.message }, { status: 500 }); }
        let sent = 0, failed = 0;
        for (const r of claimed ?? []) {
          const { data: a } = await supabaseAdmin
            .from("flat_accounts")
            .select("flat_number, resident_name, resident_user_id, current_month_amount, previous_outstanding, outstanding")
            .eq("id", r.flat_id)
            .maybeSingle();
          const to = a ? await ownerEmail(a.resident_user_id) : null;
          let err: string | null;
          if (!a) err = "Flat not found";
          else if (Number(a.outstanding ?? 0) <= 0) err = "Already paid — no email needed";
          else if (!to) err = "No owner login email linked to this flat";
          else {
            const socName = await societyNameForFlat(r.flat_id);
            const body = [
              `Dear ${a.resident_name},`,
              "",
              `This is a reminder that maintenance for Flat ${a.flat_number} is due.`,
              "",
              `Flat number: ${a.flat_number}`,
              `Owner name: ${a.resident_name}`,
              `This month's maintenance: ${inr(a.current_month_amount)}`,
              `Previous outstanding: ${inr(a.previous_outstanding)}`,
              `Total amount due: ${inr(a.outstanding)}`,
              "",
              "How to pay:",
              "- Sign in to NestInLedger and tap \"Pay Maintenance\" to pay by UPI" +
                (settings?.upi_id ? ` (UPI ID: ${settings.upi_id}, ${settings.payee_name})` : "") + ".",
              "- Or pay cash to the committee and collect your receipt.",
              "",
              "If you have already paid, please ignore this email.",
              "",
              `${socName} Committee`,
            ].join("\n");
            err = await sendGmail(to, `NestInLedger – ${socName}: Maintenance due for Flat ${a.flat_number} — ${inr(a.outstanding)}`, body, socName);
          }
          const skipped = err === "Already paid — no email needed";
          await supabaseAdmin
            .from("maintenance_reminders")
            .update({
              email_status: err === null ? "sent" : skipped ? "skipped" : "failed",
              email_error: err,
              email_to: to,
              email_sent_at: err === null ? new Date().toISOString() : null,
            })
            .eq("id", r.id);
          if (err === null) sent++; else if (!skipped) failed++;
        }
        await finish(failed ? "failed" : sent ? "completed" : "skipped", sent, failed, failed ? "One or more reminder emails failed. Check the recorded email errors." : null);
        return Response.json({ sent, failed });
      },
    },
  },
});
