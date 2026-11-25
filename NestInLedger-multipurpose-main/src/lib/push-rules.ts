export const MAX_PUSH_ATTEMPTS = 3;

/** Classifies a push service response. */
export function classifyPushResponse(status: number): "accepted" | "expired" | "retry" | "failed" {
  if (status >= 200 && status < 300) return "accepted";
  if (status === 404 || status === 410) return "expired";
  if (status === 429 || status >= 500) return "retry";
  return "failed";
}

/** Backoff for temporary failures: 2 then 4 minutes; none after the last attempt. */
export function nextAttemptAt(attempts: number, now = Date.now()): string | null {
  if (attempts >= MAX_PUSH_ATTEMPTS) return null;
  return new Date(now + 2 ** attempts * 60_000).toISOString();
}
