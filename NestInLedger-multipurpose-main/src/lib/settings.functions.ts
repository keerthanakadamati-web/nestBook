import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const reminderServiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const permitted = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
    if (permitted.error || !permitted.data) throw new Error("Committee access required.");
    const runs = await context.supabase.from("reminder_runs").select("run_date,started_at,finished_at,status,recorded,sent,failed,error").order("started_at", { ascending: false }).limit(1);
    if (runs.error) throw new Error("Could not read the last reminder run.");
    return { configured: Boolean(process.env["GOOGLE_MAIL_API_KEY"] && process.env["LOVABLE_API_KEY"]), lastRun: runs.data?.[0] ?? null };
  });