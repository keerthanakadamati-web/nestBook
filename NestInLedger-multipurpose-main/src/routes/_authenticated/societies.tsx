import { createFileRoute } from "@tanstack/react-router";
import { SocietiesPage } from "@/components/societies-panel";

export const Route = createFileRoute("/_authenticated/societies")({
  head: () => ({ meta: [
    { title: "Societies — NestInLedger Admin" },
    { name: "description", content: "Admin console to add and manage all apartment societies on NestInLedger." },
    { property: "og:title", content: "Societies — NestInLedger Admin" },
    { property: "og:description", content: "Add and manage apartment societies." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SocietiesPage,
});

