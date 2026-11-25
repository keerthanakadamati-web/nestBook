import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { parsePilotTerms, requiresPilotAcceptance } from "@/lib/pilot-terms";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth" });
    }
    const status = await supabase.rpc("pilot_terms_status");
    if (status.error) throw new Error("Could not check pilot acknowledgment. Please try again.");
    const pilotTerms = parsePilotTerms(status.data);
    if (requiresPilotAcceptance(pilotTerms) && location.pathname !== "/pilot-terms") {
      throw redirect({ to: "/pilot-terms", replace: true });
    }
    return { pilotTerms };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  if (pathname === "/pilot-terms") return <Outlet />;
  return <AppSidebarLayout><Outlet /></AppSidebarLayout>;
}
