import { createFileRoute } from "@tanstack/react-router";
import { AdministrativePage } from "@/components/administrative-pages";
export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({ meta: [
    { title: "Maintenance — NestInLedger" }, { name: "description", content: "Maintenance balances and payment details." },
    { property: "og:title", content: "Maintenance — NestInLedger" }, { property: "og:description", content: "Maintenance balances and payment details." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: () => <AdministrativePage page="maintenance" />,
});