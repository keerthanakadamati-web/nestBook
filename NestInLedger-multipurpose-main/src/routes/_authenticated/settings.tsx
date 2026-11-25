import { createFileRoute } from "@tanstack/react-router";
import { AdministrativePage } from "@/components/administrative-pages";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings — NestInLedger" }, { name: "description", content: "Application and apartment configuration." },
    { property: "og:title", content: "Settings — NestInLedger" }, { property: "og:description", content: "Application and apartment configuration." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: () => <AdministrativePage page="settings" />,
});