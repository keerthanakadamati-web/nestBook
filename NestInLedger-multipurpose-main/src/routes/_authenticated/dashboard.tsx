import { createFileRoute } from "@tanstack/react-router";

import { CommitteeConsole } from "@/components/committee-console";
import { AdminHome } from "@/components/admin-home";
import { useSessionRole } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Committee dashboard — NestInLedger" },
      {
        name: "description",
        content:
          "See paid and pending flats, add residents, record cash payments and issue receipts.",
      },
      { property: "og:title", content: "Committee dashboard — NestInLedger" },
      {
        property: "og:description",
        content: "Maintenance collection overview for your apartment committee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { apartment?: string } => (s["apartment"] ? { apartment: String(s["apartment"]) } : {}),
  component: Dashboard,
});

function Dashboard() {
  const { role, loading } = useSessionRole();
  const { apartment } = Route.useSearch();
  if (!loading && role === "admin" && !apartment) return <AdminHome />;
  return <CommitteeConsole view="overview" />;
}
