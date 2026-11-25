import { Link, useLocation } from "@tanstack/react-router";
import { Landmark, CreditCard, Receipt } from "lucide-react";

const TABS = [
  { to: "/fund", label: "Fund & Balance", hint: "How much money the society has", icon: Landmark },
  { to: "/payments", label: "Money In", hint: "Maintenance collected from flats", icon: CreditCard },
  { to: "/expenses", label: "Money Out", hint: "Bills and spending", icon: Receipt },
] as const;

export const FINANCE_PATHS: readonly string[] = TABS.map((t) => t.to);

export function FinanceTabs() {
  const { pathname } = useLocation();
  if (!FINANCE_PATHS.includes(pathname)) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finances</p>
      <nav aria-label="Finances" className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
        {TABS.map(({ to, label, hint, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link key={to} to={to} aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:text-left ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
              <Icon className="size-5 shrink-0" />
              <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className={`hidden text-xs sm:block ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{hint}</span></span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
