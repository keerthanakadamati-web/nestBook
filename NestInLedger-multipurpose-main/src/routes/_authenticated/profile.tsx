import { createFileRoute } from "@tanstack/react-router";

import { OwnerPortal } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Owner Settings — NestInLedger" },
      { name: "description", content: "Your email, name and mobile number." },
      { property: "og:title", content: "Owner Settings — NestInLedger" },
      { property: "og:description", content: "Your email, name and mobile number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OwnerPortal view="profile" />,
});
