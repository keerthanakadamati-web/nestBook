import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MaintenanceRate } from "./billing-config";
export function useBillingRates() {
  const [rates, setRates] = useState<MaintenanceRate[]>([]);
  useEffect(() => { supabase.from("maintenance_rates").select("effective_month,monthly_amount,due_day,fy_start_month").then(({ data }) => { if (data) setRates(data); }); }, []);
  return rates;
}