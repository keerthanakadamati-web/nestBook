import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The public half of the notification key; safe to share with browsers. */
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const { vapidPublicKey } = await import("./web-push.server");
  return { publicKey: await vapidPublicKey() };
});

/** Sends a test notification to the signed-in user's own devices only. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUsers } = await import("./web-push.server");
    return sendPushToUsers(
      [context.userId],
      { title: "NestInLedger", body: "Notifications are working on this device.", url: "/dashboard" },
      { eventType: "test", eventId: `${context.userId}-${Date.now()}` },
    );
  });
