import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Options = { title: string; description?: string; confirmLabel?: string; destructive?: boolean };

/** In-app confirmation dialog (replaces the browser's confirm pop-up). */
export function useConfirm(): [ReactNode, (o: Options) => Promise<boolean>] {
  const [opts, setOpts] = useState<Options | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((o: Options) => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts]);

  const node = opts ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => close(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-semibold">{opts.title}</h2>
        {opts.description && <p className="mt-2 text-sm text-muted-foreground">{opts.description}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button variant={opts.destructive ? "destructive" : "default"} autoFocus onClick={() => close(true)}>{opts.confirmLabel ?? "Confirm"}</Button>
        </div>
      </div>
    </div>
  ) : null;

  return [node, ask];
}
