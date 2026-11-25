import { createFileRoute } from "@tanstack/react-router";
import { AdministrativePage } from "@/components/administrative-pages";
export const Route = createFileRoute("/_authenticated/owners")({
  head: () => ({ meta: [
    { title: "Owners — NestInLedger" }, { name: "description", content: "Owner details and linked flat accounts." },
    { property: "og:title", content: "Owners — NestInLedger" }, { property: "og:description", content: "Owner details and linked flat accounts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: () => <AdministrativePage page="owners" />,
});