import { createFileRoute } from "@tanstack/react-router";

import { OwnerPortal } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/my-flat")({
  head: () => ({
    meta: [
      { title: "My flat — NestInLedger" },
      {
        name: "description",
        content: "See your flat's maintenance amount, dues, payments and receipts.",
      },
      { property: "og:title", content: "My flat — NestInLedger" },
      { property: "og:description", content: "Your maintenance dues, payments and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OwnerPortal view="dashboard" />,
});
