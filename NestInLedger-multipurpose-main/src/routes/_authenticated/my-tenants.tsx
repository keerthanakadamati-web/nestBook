import { createFileRoute } from "@tanstack/react-router";

import { OwnerPortal } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/my-tenants")({
  head: () => ({
    meta: [
      { title: "My tenants — NestInLedger" },
      { name: "description", content: "Add or change tenant details for your own flats." },
      { property: "og:title", content: "My tenants — NestInLedger" },
      { property: "og:description", content: "Add or change tenant details for your own flats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OwnerPortal view="tenants" />,
});
