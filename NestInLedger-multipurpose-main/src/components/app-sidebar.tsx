import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { VoiceAssistant } from "@/components/voice-assistant";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Users, DoorOpen, UserRound, Megaphone, Wrench, CreditCard, Receipt, MessageSquare, Files, LogOut, Menu, X, Landmark, History, Settings, PanelLeftClose, PanelLeftOpen, Images, HardDrive, PhoneCall, Vote, BadgeCheck, LifeBuoy, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useSessionRole, signOutEverything } from "@/lib/session";
import { isCommittee, roleLabel } from "@/lib/permissions";
import { ApprovalNotification } from "@/components/approval-notification";
import { ComplaintNotification } from "@/components/complaint-notification";
import { NotificationBell } from "@/components/notification-bell";
import { LicenseGate } from "@/components/license-gate";
import { FinanceTabs, FINANCE_PATHS } from "@/components/finance-tabs";
import { HelpTabs, HELP_PATHS } from "@/components/help-tabs";
import { BrandLogo, BrandMark } from "@/components/brand-logo";
import { settingsDestination } from "@/lib/settings-access";

type Destination = "/societies" | "/license" | "/polls" | "/equipment" | "/directory" | "/gallery" | "/storage" | "/complaints" | "/documents" | "/owners" | "/tenants" | "/maintenance" | "/payments" | "/settings" | "/reports" | "/approvals" | "/dashboard" | "/my-flat" | "/expenses" | "/flats" | "/fund" | "/my-maintenance" | "/my-payments" | "/my-tenants" | "/announcements" | "/profile" | "/support" | "/demo";
type MenuItem = { label: string; icon: LucideIcon; to?: Destination | undefined };

function Navigation() {
  const { role, loading, name, societyName } = useSessionRole();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const [loggingOut, setLoggingOut] = useState(false);
  const home: Destination = isCommittee(role) ? "/dashboard" : "/my-flat";
  const items: MenuItem[] = role === "admin" ? [
    { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
    { label: "Technical Support", icon: LifeBuoy, to: "/support" },
    { label: "Website Renewal", icon: BadgeCheck, to: "/license" },
  ] : role === "treasurer" ? [
    { label: "Dashboard", icon: LayoutDashboard, to: home },
    { label: "Maintenance", icon: Wrench, to: "/maintenance" },
    { label: "Finances", icon: Landmark, to: "/fund" },
    { label: "Documents", icon: Files, to: "/documents" },
    { label: "Proposals / History", icon: History, to: "/approvals" },
    { label: "Society Care", icon: PhoneCall, to: "/directory" },
    { label: "Polls & Voting", icon: Vote, to: "/polls" },
  ] : isCommittee(role) ? [
    { label: "Dashboard", icon: LayoutDashboard, to: home },
    { label: "Flats & Residents", icon: DoorOpen, to: "/flats" },
    { label: "Announcements", icon: Megaphone, to: "/announcements" },
    { label: "Maintenance", icon: Wrench, to: "/maintenance" },
    { label: "Finances", icon: Landmark, to: "/fund" },
    { label: "Complaints", icon: MessageSquare, to: "/complaints" },
    { label: "Documents", icon: Files, to: "/documents" },
    { label: "Society Care", icon: PhoneCall, to: "/directory" },
    { label: "Polls & Voting", icon: Vote, to: "/polls" },
    { label: "Proposals / History", icon: History, to: "/approvals" },
    { label: "Technical Support", icon: LifeBuoy, to: "/support" },
  ] : [
    { label: "Dashboard", icon: LayoutDashboard, to: home },
    { label: "Maintenance", icon: Wrench, to: "/my-maintenance" },
    { label: "Payments", icon: CreditCard, to: "/my-payments" },
    { label: "Announcements", icon: Megaphone, to: "/announcements" },
    { label: "Tenants", icon: Users, to: "/my-tenants" },
    { label: "Complaints", icon: MessageSquare, to: "/complaints" },
    { label: "Documents", icon: Files, to: "/documents" },
    { label: "Society Care", icon: PhoneCall, to: "/directory" },
    { label: "Polls & Voting", icon: Vote, to: "/polls" },
  ];

  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);

  async function logout() {
    setLoggingOut(true);
    try {
      await signOutEverything();
      setOpenMobile(false);
      await navigate({ to: "/auth", replace: true });
    } finally { setLoggingOut(false); }
  }

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-4">
        <div className="flex min-h-10 items-center gap-2 px-1 group-data-[collapsible=icon]:px-0">
          <BrandMark className="hidden group-data-[collapsible=icon]:block" />
          <BrandLogo className="text-base group-data-[collapsible=icon]:hidden" />
          {isMobile && <Button variant="ghost" size="icon" className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Close menu" onClick={() => setOpenMobile(false)}><X /></Button>}
        </div>
        {!loading && societyName && role !== "admin" ? (
          <p className="mt-1 truncate px-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden" title={societyName}>
            {societyName}
          </p>
        ) : null}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <nav aria-label="Pages">
          <SidebarMenu>
            {!loading && items.map(({ label, icon: Icon, to }) => (
              <SidebarMenuItem key={label}>
                {to ? (
                  <SidebarMenuButton asChild isActive={pathname === to || (to === "/fund" && FINANCE_PATHS.includes(pathname)) || (to === "/directory" && HELP_PATHS.includes(pathname))} tooltip={label} className="relative h-9 rounded-lg transition-colors data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-2 data-[active=true]:before:bottom-2 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-sidebar-primary">
                    <Link to={to} aria-current={pathname === to ? "page" : undefined} onClick={() => setOpenMobile(false)}><Icon /><span>{label}</span></Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton disabled tooltip={label} className="h-10"><Icon /><span>{label}</span></SidebarMenuButton>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!loading && (
          <div className="flex items-center gap-2 px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{name ?? "Name not set"}</p>
            <p className="text-xs text-sidebar-foreground/70">{roleLabel(role)}</p></div>
            <Button asChild variant="ghost" size="icon" className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Link to={settingsDestination(role)} aria-label="Settings" title="Settings" onClick={() => setOpenMobile(false)}><Settings className="size-4" /></Link></Button>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block"><SidebarMenuButton asChild tooltip="Settings" isActive={pathname === settingsDestination(role)}><Link to={settingsDestination(role)} aria-label="Settings" onClick={() => setOpenMobile(false)}><Settings /></Link></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton onClick={logout} disabled={loggingOut} tooltip="Sign out" className="h-10"><LogOut /><span>{loggingOut ? "Signing out…" : "Sign out"}</span></SidebarMenuButton></SidebarMenuItem>
          {!isMobile && <SidebarMenuItem><SidebarMenuButton onClick={toggleSidebar} tooltip={state === "expanded" ? "Collapse menu" : "Expand menu"} aria-label={state === "expanded" ? "Collapse menu" : "Expand menu"} className="h-10">{state === "expanded" ? <PanelLeftClose /> : <PanelLeftOpen />}<span>Collapse menu</span></SidebarMenuButton></SidebarMenuItem>}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileMenu() {
  const { toggleSidebar, openMobile } = useSidebar();
  return <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/90 px-4 backdrop-blur-md text-sidebar-foreground md:hidden"><Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Open menu" aria-expanded={openMobile} onClick={toggleSidebar}><Menu /></Button><BrandLogo className="flex-1 text-sm" markClassName="size-5" /><NotificationBell className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" /></header>;
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  return <SidebarProvider className="app-navigation"><Navigation /><div className="relative min-w-0 flex-1"><MobileMenu /><div className="absolute right-4 top-3 z-20 hidden md:block"><NotificationBell className="border border-border bg-card shadow-sm" /></div><ApprovalNotification /><ComplaintNotification /><LicenseGate><FinanceTabs /><HelpTabs />{children}</LicenseGate><VoiceAssistant /></div></SidebarProvider>;
}