import { createFileRoute } from "@tanstack/react-router";

import { OwnerPortal } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/my-maintenance")({
  head: () => ({
    meta: [
      { title: "My maintenance — NestInLedger" },
      { name: "description", content: "Maintenance amount and dues for your flats." },
      { property: "og:title", content: "My maintenance — NestInLedger" },
      { property: "og:description", content: "Maintenance amount and dues for your flats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OwnerPortal view="maintenance" />,
});
