import { createFileRoute } from "@tanstack/react-router";
import { AdministrativePage } from "@/components/administrative-pages";
export const Route = createFileRoute("/_authenticated/tenants")({
  head: () => ({ meta: [
    { title: "Tenants — NestInLedger" }, { name: "description", content: "Occupancy and tenant details." },
    { property: "og:title", content: "Tenants — NestInLedger" }, { property: "og:description", content: "Occupancy and tenant details." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: () => <AdministrativePage page="tenants" />,
});