import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
export type SocietyConfiguration = Database["public"]["Tables"]["society_settings"]["Row"];
export async function loadBillingConfiguration() {
  const [rates, bills] = await Promise.all([
    supabase.from("maintenance_rates").select("effective_month,monthly_amount,due_day,fy_start_month").order("effective_month"),
    supabase.from("maintenance_bills").select("flat_id,bill_month,amount,due_date"),
  ]);
  if (rates.error || bills.error) throw new Error("Could not load approved maintenance charges.");
  return { rates: rates.data ?? [], bills: bills.data ?? [] };
}