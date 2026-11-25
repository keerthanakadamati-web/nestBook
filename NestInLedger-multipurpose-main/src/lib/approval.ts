import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { submitPayment } from "./payment-submission";

export type ApprovalModule = "flats" | "payments" | "expenses" | "announcements" | "fund_years" | "society_settings" | "user_roles" | "complaints" | "gallery_albums" | "gallery_photos" | "gallery_budget" | "recurring_expenses" | "recurring_entries";
export type ApprovalAction = "create" | "update" | "delete" | "create_login" | "set_role";
const treasurerProposalModules: ApprovalModule[] = ["recurring_expenses", "recurring_entries", "expenses"];
export async function saveAdministrativeChange(
  change: { module: ApprovalModule; action: ApprovalAction; key?: string | undefined; values: Record<string, Json | undefined> },
  live: () => PromiseLike<{ error: { message: string } | null }>,
) {
  if (change.module === "payments" && change.action === "create") return submitPayment(change.values);
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: { message: "Please sign in again." }, pending: false };
  const { data: secretary, error } = await supabase.rpc("has_role", { _user_id: user.user.id, _role: "secretary" });
  if (error) return { error, pending: false };
  const { data: treasurer, error: treasurerError } = await supabase.rpc("has_role", { _user_id: user.user.id, _role: "treasurer" });
  if (treasurerError) return { error: treasurerError, pending: false };
  const { data: privileged, error: privilegeError } = await supabase.rpc("has_permission", { _permission: "admin.write" });
  if (privilegeError) return { error: privilegeError, pending: false };
  const mustPropose = !privileged && (secretary || (treasurer && treasurerProposalModules.includes(change.module)));
  if (mustPropose) {
    const values = { ...change.values };
    delete values['updated_at']; delete values['recorded_by']; delete values['created_by'];
    const result = await supabase.rpc("submit_change", { _module: change.module, _action: change.action, _key: change.key ?? "", _values: values });
    if (!result.error) window.dispatchEvent(new Event("approvals-changed"));
    return { error: result.error, pending: true };
  }
  return { ...(await live()), pending: false };
}