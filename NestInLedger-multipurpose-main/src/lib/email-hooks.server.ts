import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export async function verifyHookToken(request: Request): Promise<boolean> {
  const m = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!m?.[1]) return false;
  const { data } = await supabaseAdmin
    .from("internal_tokens" as never)
    .select("token")
    .eq("name", "email_hook")
    .maybeSingle();
  const expected = (data as { token?: string } | null)?.token;
  if (!expected || expected.length !== m[1].length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ m[1].charCodeAt(i);
  return diff === 0;
}

export async function ownerEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function societyNameForFlat(flatId: string): Promise<string> {
  const { data: flat } = await supabaseAdmin.from("flats").select("society_id").eq("id", flatId).maybeSingle();
  if (!flat?.society_id) return "Apartment Society";
  const { data: soc } = await supabaseAdmin.from("societies").select("name").eq("id", flat.society_id).maybeSingle();
  return soc?.name?.trim() || "Apartment Society";
}

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

/** Returns null on confirmed success, otherwise the error text. */
export async function sendGmail(to: string, subject: string, body: string, societyName?: string): Promise<string | null> {
  // Prefer the society's own domain (nestinledger.com); fall back to Gmail only if it is not ready.
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const r = await sendTemplateEmail("society-notice", to, { templateData: { subject, body, ...(societyName ? { societyName } : {}) } });
    return r.sent ? null : "Recipient has unsubscribed or bounced";
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code !== "domain_not_verified" && code !== "emails_disabled") {
      return `Email failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return sendViaGmail(to, subject, body);
}

async function sendViaGmail(to: string, subject: string, body: string): Promise<string | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) return "Gmail connection is not configured";
  const raw = b64(
    [`To: ${to}`, `Subject: ${header(subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", body].join("\r\n"),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  try {
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const text = await res.text();
    if (!res.ok) return `Gmail error [${res.status}]: ${text.slice(0, 500)}`;
    const json = JSON.parse(text) as { id?: string };
    return json.id ? null : `Gmail did not confirm: ${text.slice(0, 500)}`;
  } catch (e) {
    return `Gmail request failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function inr(n: number | string | null | undefined) {
  return "Rs. " + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
