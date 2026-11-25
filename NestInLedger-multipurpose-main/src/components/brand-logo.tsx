import { cn } from "@/lib/utils";

/** House mark with "In" in the doorway. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6 shrink-0", className)} role="img" aria-label="NestInLedger">
      <rect x="21" y="5" width="3" height="6" rx="0.5" className="fill-sidebar-primary" />
      <path d="M16 3 L30 15 H26 V29 H6 V15 H2 Z" className="fill-sidebar-primary" />
      <text x="16" y="25" textAnchor="middle" fontSize="10.5" fontWeight="800" fontFamily="Inter, system-ui, sans-serif" className="fill-sidebar-primary-foreground">In</text>
    </svg>
  );
}

/** Full wordmark: Nest [house with In] Ledger. */
export function BrandLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-bold tracking-tight", className)} aria-label="NestInLedger">
      <span aria-hidden="true">Nest</span>
      <BrandMark className={cn("-mt-1", markClassName)} />
      <span aria-hidden="true">Ledger</span>
    </span>
  );
}
