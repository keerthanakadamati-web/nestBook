import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Keep an uncertain submission's identity across closing/reopening a form. */
export async function submitPayment(values: Record<string, Json | undefined>, cashReviewed = false) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { error: { message: "Please sign in again." }, pending: false };
    const payload: Record<string, Json> = {};
    for (const key of ["flat_id", "amount", "method", "status", "paid_on", "month_covered", "reference", "notes"]) {
      const value = values[key];
      if (value !== undefined) payload[key] = value;
    }
    const storageKey = `payment-request:${data.user.id}:${JSON.stringify(payload)}:${cashReviewed}`;
    const requestId = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    sessionStorage.setItem(storageKey, requestId);
    const result = await supabase.rpc("submit_payment", { _request: requestId, _values: payload, _cash_reviewed: cashReviewed });
    if (result.error) return { error: result.error, pending: false };
    const pending = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data) && result.data['pending'] === true;
    if (pending) window.dispatchEvent(new Event("approvals-changed"));
    const paymentId = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data) ? String(result.data['payment_id'] ?? "") : "";
    // Keep the successful identity too: repeated clicks/reopens replay, never insert twice.
    return { error: null, pending, paymentId };
  } catch {
    return { error: { message: "Could not confirm the submission. Retry the same details safely." }, pending: false };
  }
}
/** Screenshots live in month folders: YYYY-MM/<flat_id>/<payment_id>.<ext> */
export function proofFolder(flatId: string, paidOn: string) { return `${paidOn.slice(0, 7)}/${flatId}`; }

export async function uploadPaymentProof(flatId: string, paidOn: string, paymentId: string, file: File) {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  return supabase.storage.from("payment-proofs").upload(`${proofFolder(flatId, paidOn)}/${paymentId}.${ext}`, file, { upsert: false });
}

export async function openPaymentProof(flatId: string, paidOn: string, paymentId: string) {
  const folder = proofFolder(flatId, paidOn);
  const { data } = await supabase.storage.from("payment-proofs").list(folder, { search: paymentId });
  const file = data?.find((f) => f.name.startsWith(paymentId));
  if (!file) return false;
  const signed = await supabase.storage.from("payment-proofs").createSignedUrl(`${folder}/${file.name}`, 120);
  if (!signed.data) return false;
  window.open(signed.data.signedUrl, "_blank");
  return true;
}
