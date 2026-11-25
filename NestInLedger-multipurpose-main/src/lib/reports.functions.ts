import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listFinancialReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError || !roles?.some(({ role }) => ["treasurer", "president", "secretary", "admin"].includes(role))) throw new Error("Committee finance access required.");
    const { data, error } = await context.supabase.from("financial_reports").select("*").order("generated_at", { ascending: false });
    if (error) throw new Error("Could not load financial reports.");
    const rates = await context.supabase.from("maintenance_rates").select("effective_month,monthly_amount,due_day,fy_start_month");
    if (rates.error) throw new Error("Could not load approved report periods.");
    return { reports: data ?? [], roles: roles.map(({ role }) => role), rates: rates.data ?? [] };
  });