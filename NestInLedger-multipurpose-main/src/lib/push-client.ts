// Browser-side notification sign-up. Call only from effects or click handlers.
import { supabase } from "@/integrations/supabase/client";
import { getPushPublicKey } from "@/lib/push.functions";

export type PushSupport = "ready" | "unsupported" | "ios-install" | "preview" | "blocked";

const WORKER = "/push-sw.js";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (window.self !== window.top) return "preview";
  if (isIos() && !isInstalled()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

function keyBytes(base64url: string) {
  const s = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(WORKER);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** True when this device is signed up and still on record for this user. */
export async function isThisDeviceEnabled(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  const { data } = await supabase.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).eq("enabled", true).maybeSingle();
  return Boolean(data);
}

export async function enableThisDevice(userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "blocked" : "dismissed");
  const reg = await navigator.serviceWorker.register(WORKER, { scope: "/" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await getPushPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options.applicationServerKey) {
    const existing = new Uint8Array(sub.options.applicationServerKey);
    const wanted = keyBytes(publicKey);
    if (existing.length !== wanted.length || existing.some((b, i) => b !== wanted[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as unknown as BufferSource });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys?.["auth"]) throw new Error("Device did not return notification details");
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys["p256dh"],
    auth: json.keys["auth"],
    user_agent: navigator.userAgent.slice(0, 500),
    enabled: true,
    last_active_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw new Error("save");
}

/** Removes this device's sign-up for the signed-in user. Safe to call when not signed up. */
export async function disableThisDevice(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
}
