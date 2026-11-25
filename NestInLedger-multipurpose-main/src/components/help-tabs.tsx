import { Link, useLocation } from "@tanstack/react-router";
import { PhoneCall, Cog } from "lucide-react";

const TABS = [
  { to: "/directory", label: "Emergency & Contacts", hint: "Important phone numbers", icon: PhoneCall },
  { to: "/equipment", label: "Equipment & AMC", hint: "Lift, pumps, service dates", icon: Cog },
] as const;

export const HELP_PATHS: readonly string[] = TABS.map((t) => t.to);

export function HelpTabs() {
  const { pathname } = useLocation();
  if (!HELP_PATHS.includes(pathname)) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Society Care</p>
      <nav aria-label="Society Care" className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
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
