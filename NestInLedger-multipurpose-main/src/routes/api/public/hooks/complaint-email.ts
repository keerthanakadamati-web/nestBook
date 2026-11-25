import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/hooks/complaint-email")({
  server: { handlers: { POST: async ({ request }) => {
    const { verifyHookToken, sendGmail, ownerEmail, societyNameForFlat } = await import("@/lib/email-hooks.server");
    if (!(await verifyHookToken(request))) return new Response("Unauthorized", { status: 401 });
    const input = z.object({ notification_id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid notification" }, { status: 400 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claim = await supabaseAdmin.from("complaint_notifications").update({ email_status: "sending" }).eq("id", input.data.notification_id).eq("email_status", "queued").select("*").maybeSingle();
    if (claim.error) return Response.json({ error: "Could not claim notification" }, { status: 500 });
    if (!claim.data) return Response.json({ skipped: "Already handled" });
    const n = claim.data;
    const event = await supabaseAdmin.from("complaint_events").select("complaint_id, comment").eq("id", n.event_id).single();
    const complaint = event.data ? await supabaseAdmin.from("complaints").select("title, status, flat_id, resolution_details").eq("id", event.data.complaint_id).single() : null;
    const recipientRoles = await supabaseAdmin.from("user_roles").select("role").eq("user_id", n.recipient_id);
    const to = await ownerEmail(n.recipient_id);
    let error: string | null = null;
    if (recipientRoles.error || event.error || complaint?.error || !complaint?.data) error = "Complaint notification details unavailable";
    else if (recipientRoles.data.some((r) => r.role === "treasurer")) error = "Recipient no longer has complaint access";
    else if (!to) error = "No registered email for this account";
    else {
      const flat = await supabaseAdmin.from("flats").select("flat_number").eq("id", complaint.data.flat_id).single();
      const socName = flat.error ? "Apartment Society" : await societyNameForFlat(complaint.data.flat_id);
      error = flat.error ? "Flat details unavailable" : await sendGmail(to, `NestInLedger – ${socName}: ${n.message}`, [socName.toUpperCase(), "", n.message, `Flat: ${flat.data.flat_number}`, `Status: ${complaint.data.status}`, event.data?.comment ?? "", complaint.data.resolution_details ?? "", "", "Sign in to NestInLedger to view the complaint and its history."].filter(Boolean).join("\n"), socName);
    }
    const recorded = await supabaseAdmin.from("complaint_notifications").update({ email_status: error ? "failed" : "accepted", email_error: error, email_accepted_at: error ? null : new Date().toISOString() }).eq("id", n.id);
    if (recorded.error) return Response.json({ error: "Could not record email outcome" }, { status: 500 });
    return Response.json({ accepted: error === null });
  } } },
});