import { BrandMark } from "@/components/brand-logo";

export function PageLoader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4" aria-busy="true" aria-label={title}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full border-4 border-muted" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary border-r-accent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BrandMark className="size-9 animate-pulse" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </main>
  );
}
