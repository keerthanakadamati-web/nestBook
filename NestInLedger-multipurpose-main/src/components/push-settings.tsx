import { useEffect, useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendTestPush } from "@/lib/push.functions";
import { disableThisDevice, enableThisDevice, isThisDeviceEnabled, pushSupport, type PushSupport } from "@/lib/push-client";

export function PushSettings({ userId }: { userId: string }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "ready") isThisDeviceEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  async function turnOn() {
    setBusy(true); setMessage("");
    try {
      await enableThisDevice(userId);
      setEnabled(true);
      setMessage("Notifications are on for this device.");
    } catch (e) {
      const why = e instanceof Error ? e.message : "";
      if (why === "blocked") { setSupport("blocked"); setMessage(""); }
      else setMessage(why === "dismissed" ? "You did not allow notifications. Tap the button again to try." : "Could not turn on notifications. Please try again.");
    } finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setMessage("");
    try { await disableThisDevice(); setEnabled(false); setMessage("Notifications are off for this device."); }
    catch { setMessage("Could not turn off notifications. Please try again."); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage("");
    try {
      const r = await sendTestPush();
      setMessage(r.accepted > 0 ? "Test sent. It should appear on your device in a few seconds." : "The test could not be sent. Turn notifications off and on, then try again.");
    } catch { setMessage("The test could not be sent. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5" aria-labelledby="push-heading">
      <h2 id="push-heading" className="flex items-center gap-2 text-lg font-semibold"><Bell className="size-5" aria-hidden /> Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">Get alerts on this phone or computer, even when NestInLedger is closed. Turn on each device you use.</p>

      {support === null && <p className="mt-3 text-sm text-muted-foreground">Checking this device…</p>}
      {support === "preview" && <p className="mt-3 text-sm">Open NestInLedger in its own browser tab or the installed app to turn on notifications.</p>}
      {support === "unsupported" && <p className="mt-3 text-sm">This browser cannot show notifications. Try Chrome on Android or a computer.</p>}
      {support === "blocked" && <p className="mt-3 text-sm">Notifications are blocked for NestInLedger. Allow them in your browser or phone settings, then come back here.</p>}
      {support === "ios-install" && (
        <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">On iPhone, add NestInLedger to your Home Screen first:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open this page in Safari.</li>
            <li>Tap <Share className="inline size-4" aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>.</li>
            <li>Open NestInLedger from your Home Screen and come back to this page.</li>
          </ol>
        </div>
      )}
      {support === "ready" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={enabled ? "text-sm font-medium text-primary" : "text-sm text-muted-foreground"}>{enabled ? "On for this device" : "Off for this device"}</span>
          {enabled
            ? <Button variant="outline" disabled={busy} onClick={turnOff}><BellOff className="size-4" aria-hidden /> Turn off</Button>
            : <Button disabled={busy} onClick={turnOn}><Bell className="size-4" aria-hidden /> Turn on notifications</Button>}
          {enabled && <Button variant="outline" disabled={busy} onClick={test}>Send test notification</Button>}
        </div>
      )}
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
