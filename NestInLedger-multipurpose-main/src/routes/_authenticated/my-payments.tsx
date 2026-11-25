import { createFileRoute } from "@tanstack/react-router";

import { OwnerPortal } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/my-payments")({
  head: () => ({
    meta: [
      { title: "My payments — NestInLedger" },
      { name: "description", content: "Payment history and receipts for your flats." },
      { property: "og:title", content: "My payments — NestInLedger" },
      { property: "og:description", content: "Payment history and receipts for your flats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OwnerPortal view="payments" />,
});
