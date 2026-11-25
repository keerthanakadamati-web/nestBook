import { supabase } from "@/integrations/supabase/client";

import { fyRange } from "./format";
import { expenseAccountingMonth, societyDate } from "./accounting-date";

export type FundSummary = { opening: number; received: number; spent: number; balance: number; openingRecorded: boolean; asOf: string };

/** Corporate Fund for one financial year: opening + received − spent. */
export async function loadFund(fy: number, startMonth = 4, asOf = societyDate()): Promise<FundSummary> {
  const { from, to } = fyRange(fy, startMonth);
  const [openingResult, paymentResult, expenseResult] = await Promise.all([
    supabase.from("fund_years").select("opening_balance").eq("fy_start", fy).maybeSingle(),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "confirmed")
      .gte("paid_on", from)
      .lt("paid_on", to).lte("paid_on", asOf),
    supabase.from("expenses").select("amount,expense_month,expense_date"),
  ]);
  if (openingResult.error || paymentResult.error || expenseResult.error) throw new Error("Could not load fund records. Please try again.");
  const row = openingResult.data, pays = paymentResult.data;
  const exps = (expenseResult.data ?? []).filter((e) => {
    const month = expenseAccountingMonth(e);
    return month >= from.slice(0, 7) && month < to.slice(0, 7) && month <= asOf.slice(0, 7);
  });
  const opening = Number(row?.opening_balance ?? 0);
  const received = (pays ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const spent = (exps ?? []).reduce((t, e) => t + Number(e.amount), 0);
  return { opening, received, spent, balance: opening + received - spent, openingRecorded: row !== null, asOf };
}
