import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  kind: z.enum(["proposal_pending", "proposal_decided", "payment_pending", "payment_confirmed", "payment_rejected", "announcement", "complaint", "reminders", "poll"]),
  id: z.string().uuid(),
});

const inr = (n: number | string) => `₹${Number(n).toLocaleString("en-IN")}`;

export const Route = createFileRoute("/api/public/hooks/push-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyHookToken } = await import("@/lib/email-hooks.server");
        if (!(await verifyHookToken(request))) return new Response("Unauthorized", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return Response.json({ error: "Invalid event" }, { status: 400 });
        const { kind, id } = parsed.data;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { sendPushToUsers } = await import("@/lib/web-push.server");

        const usersWithRoles = async (roles: string[]) =>
          ((await db.from("user_roles").select("user_id").in("role", roles as never)).data ?? []).map((r) => r.user_id);
        const send = (users: (string | null | undefined)[], title: string, body: string, url: string, eventId = id) =>
          sendPushToUsers(users.filter(Boolean) as string[], { title, body, url }, { eventType: kind, eventId });

        if (kind === "proposal_pending" || kind === "proposal_decided") {
          const { data: p } = await db.from("change_proposals").select("module, action, status, submitted_by").eq("id", id).maybeSingle();
          if (!p) return Response.json({ skipped: "not found" });
          const what = `${p.action.replace("_", " ")} in ${p.module.replace(/_/g, " ")}`;
          if (kind === "proposal_pending") {
            // Money collected → Treasurer; expenses → President and Secretary (Secretary approves when the President is unavailable).
            const deciders = p.module === "payments" ? ["treasurer"] : ["expenses", "recurring_entries", "recurring_expenses"].includes(p.module) ? ["president", "secretary"] : ["president"];
            const who = (await usersWithRoles(deciders)).filter((u) => u !== p.submitted_by);
            return Response.json(await send(who, p.module === "payments" ? "Payment to approve" : "Approval needed", `A new request is waiting: ${what}.`, "/approvals"));
          }
          return Response.json(await send([p.submitted_by], `Request ${p.status}`, `Your request (${what}) was ${p.status}.`, "/approvals", `${id}:${p.status}`));
        }

        if (kind.startsWith("payment_")) {
          const { data: p } = await db.from("payments").select("amount, status, month_covered, flat_id").eq("id", id).maybeSingle();
          if (!p) return Response.json({ skipped: "not found" });
          const { data: f } = await db.from("flats").select("flat_number, resident_user_id").eq("id", p.flat_id).maybeSingle();
          const flat = f?.flat_number ?? "";
          if (kind === "payment_pending") {
            return Response.json(await send(await usersWithRoles(["admin", "treasurer"]), "Payment to check", `Flat ${flat} sent ${inr(p.amount)} for ${p.month_covered}. Please confirm.`, "/payments"));
          }
          const ok = kind === "payment_confirmed";
          return Response.json(await send([f?.resident_user_id], ok ? "Payment received" : "Payment not accepted",
            ok ? `Flat ${flat}: ${inr(p.amount)} received. Your receipt is ready.` : `Flat ${flat}: your ${inr(p.amount)} payment could not be confirmed. Please contact the committee.`,
            "/my-payments"));
        }

        if (kind === "poll") {
          const { data: pl } = await db.from("society_polls").select("title, status").eq("id", id).maybeSingle();
          if (pl?.status !== "active") return Response.json({ skipped: "not open" });
          const owners = ((await db.from("flats").select("resident_user_id")).data ?? []).map((f) => f.resident_user_id);
          const all = [...owners, ...(await usersWithRoles(["admin", "president", "secretary", "treasurer", "resident"]))];
          return Response.json(await send(all, "New poll — please vote", pl.title, "/polls"));
        }

        if (kind === "announcement") {
          const { data: a } = await db.from("announcements").select("title, category, published").eq("id", id).maybeSingle();
          if (!a?.published) return Response.json({ skipped: "not published" });
          const owners = ((await db.from("flats").select("resident_user_id")).data ?? []).map((f) => f.resident_user_id);
          const all = [...owners, ...(await usersWithRoles(["admin", "president", "secretary", "treasurer", "resident"]))];
          return Response.json(await send(all, `New notice: ${a.category}`, a.title, "/announcements"));
        }

        if (kind === "complaint") {
          const { data: n } = await db.from("complaint_notifications").select("recipient_id, message").eq("id", id).maybeSingle();
          if (!n) return Response.json({ skipped: "not found" });
          return Response.json(await send([n.recipient_id], "Complaint update", n.message, "/complaints"));
        }

        // reminders: one notification per owner for that day's unpaid flats.
        const { data: run } = await db.from("reminder_runs").select("run_date").eq("id", id).maybeSingle();
        if (!run) return Response.json({ skipped: "not found" });
        const { data: rows } = await db.from("maintenance_reminders").select("flat_id, amount_due").eq("reminder_date", run.run_date);
        const flatIds = (rows ?? []).map((r) => r.flat_id);
        const { data: flats } = flatIds.length ? await db.from("flats").select("id, flat_number, resident_user_id").in("id", flatIds) : { data: [] };
        const totals = { accepted: 0, failed: 0, expired: 0, skipped: 0 };
        for (const r of rows ?? []) {
          const f = flats?.find((x) => x.id === r.flat_id);
          if (!f?.resident_user_id) continue;
          const res = await send([f.resident_user_id], "Maintenance due", `Flat ${f.flat_number}: ${inr(r.amount_due)} is due. Please pay soon.`, "/my-maintenance", `${id}:${f.id}`);
          for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += res[k];
        }
        return Response.json(totals);
      },
    },
  },
});
