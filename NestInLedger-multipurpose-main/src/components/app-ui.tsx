import type { ReactNode } from "react";

import { STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg bg-card p-5 shadow-tile ring-1 ring-border md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Tile({ label, value, tone }: { label: string; value: string; tone?: "sage" | "clay" }) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-tile transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent to-transparent opacity-70",
          tone === "sage" ? "via-sage-deep" : tone === "clay" ? "via-clay-deep" : "via-primary/40",
        )}
      />
      <p className="flex min-h-10 items-start gap-2 text-[13px] font-medium leading-5 text-muted-foreground">
        {tone ? <span className={cn("live-dot mt-1.5 shrink-0", tone === "sage" ? "text-sage-deep" : "text-clay-deep")} aria-hidden="true" /> : null}
        {label}
      </p>
      <p
        className={cn(
          "mt-2 break-words font-display text-2xl font-semibold leading-tight tracking-tight tabular-nums sm:text-3xl",
          tone === "sage" && "text-sage-deep",
          tone === "clay" && "text-clay-deep",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={cn(
        "inline-block rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground",
        ["paid", "confirmed", "approved"].includes(status) && "bg-sage text-sage-deep",
        ["partial", "pending", "submitted", "reviewed"].includes(status) && "bg-secondary text-secondary-foreground",
        ["outstanding", "overdue", "rejected"].includes(status) && "bg-clay text-clay-deep",
      )}
    >
      {label}
    </span>
  );
}

export function PrimaryButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      {...rest}
      className={cn(
        "min-h-11 whitespace-normal rounded-lg px-5 py-2.5 text-sm font-semibold shadow-pill",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function ClayButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="secondary"
      {...rest}
      className={cn(
        "min-h-11 whitespace-normal rounded-lg px-5 py-2.5 text-sm font-semibold",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function QuietButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="outline"
      {...rest}
      className={cn(
        "min-h-11 whitespace-normal rounded-lg px-3 py-2 text-sm",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function Field({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        {...rest}
        className="mt-1.5 w-full rounded-lg bg-card px-3 py-2.5 text-base text-foreground ring-1 ring-input outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-6 shadow-card ring-1 ring-border">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
          <QuietButton onClick={onClose}>Close</QuietButton>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      className={cn(
        "rounded-lg px-4 py-3 text-sm",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "ok" && "bg-sage/25 text-sage-deep",
      )}
    >
      {children}
    </p>
  );
}
