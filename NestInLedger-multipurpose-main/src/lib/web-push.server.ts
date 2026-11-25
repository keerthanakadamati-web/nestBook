import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyPushResponse, MAX_PUSH_ATTEMPTS, nextAttemptAt } from "./push-rules";
import { b64url, deriveVapidKeys, encryptPayload, sha256Hex, vapidAuthorization, type VapidKeys } from "./web-push-crypto";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushEvent = { eventType: string; eventId: string };

const SUBJECT = "mailto:notify@nestinledger.com";

let cached: Promise<VapidKeys> | null = null;
function vapidKeys(): Promise<VapidKeys> {
  const seed = process.env["VAPID_SEED"];
  if (!seed) throw new Error("Notification key is not configured");
  cached ??= deriveVapidKeys(seed);
  return cached;
}

export async function vapidPublicKey(): Promise<string> {
  return b64url((await vapidKeys()).publicKey);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(logId: string, sub: Sub, payload: PushPayload, attempts: number) {
  let status = 0;
  let error: string | null = null;
  try {
    const keys = await vapidKeys();
    const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Urgency: "normal",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: await vapidAuthorization(sub.endpoint, keys, SUBJECT),
      },
      body: body as unknown as BodyInit,
    });
    status = res.status;
    if (!res.ok) error = `Push service answered ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Network error";
  }
  const outcome = status ? classifyPushResponse(status) : "retry";
  const tries = attempts + 1;
  if (outcome === "expired") {
    await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
  }
  await supabaseAdmin.from("push_delivery_logs").update({
    status: outcome === "accepted" ? "accepted" : outcome === "expired" ? "expired" : "failed",
    attempts: tries,
    http_status: status || null,
    error_message: error,
    accepted_at: outcome === "accepted" ? new Date().toISOString() : null,
    next_attempt_at: outcome === "retry" ? nextAttemptAt(tries) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", logId);
  return outcome;
}

/**
 * Sends one notification to every enabled device of the given users.
 * The (event, device) unique key means repeated calls never notify a device twice.
 * "accepted" means the push service took the message; it does not prove the phone showed it.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload, event: PushEvent) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const result = { accepted: 0, failed: 0, expired: 0, skipped: 0 };
  if (!ids.length) return result;
  const tagged = { ...payload, tag: payload.tag ?? `${event.eventType}-${event.eventId}` };
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", ids)
    .eq("enabled", true);
  if (error) throw new Error("Could not load notification devices");
  for (const sub of subs ?? []) {
    const endpointHash = await sha256Hex(sub.endpoint);
    const claim = await supabaseAdmin.from("push_delivery_logs").insert({
      event_type: event.eventType,
      event_id: event.eventId,
      recipient_id: sub.user_id,
      subscription_id: sub.id,
      endpoint_hash: endpointHash,
      status: "sending",
      payload: tagged,
    }).select("id").maybeSingle();
    if (claim.error || !claim.data) { result.skipped++; continue; } // already handled for this device
    const outcome = await deliver(claim.data.id, sub, tagged, 0);
    if (outcome === "accepted") result.accepted++;
    else if (outcome === "expired") result.expired++;
    else result.failed++;
  }
  return result;
}

/** Retries temporary failures that are due, at most MAX_PUSH_ATTEMPTS per device. */
export async function retryDuePushes(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("push_delivery_logs")
    .select("id, attempts, payload, subscription_id")
    .eq("status", "failed")
    .lt("attempts", MAX_PUSH_ATTEMPTS)
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", new Date().toISOString())
    .limit(limit);
  if (error) throw new Error("Could not load notification retries");
  let retried = 0;
  for (const row of data ?? []) {
    // Claim the row so overlapping retry runs cannot send twice.
    const claim = await supabaseAdmin.from("push_delivery_logs")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "failed").select("id").maybeSingle();
    if (!claim.data) continue;
    const sub = row.subscription_id
      ? (await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth, enabled").eq("id", row.subscription_id).maybeSingle()).data
      : null;
    if (!sub || !sub.enabled) {
      await supabaseAdmin.from("push_delivery_logs").update({ status: "expired", next_attempt_at: null, error_message: "Device no longer signed up" }).eq("id", row.id);
      continue;
    }
    await deliver(row.id, sub, row.payload as PushPayload, row.attempts);
    retried++;
  }
  return { retried };
}
