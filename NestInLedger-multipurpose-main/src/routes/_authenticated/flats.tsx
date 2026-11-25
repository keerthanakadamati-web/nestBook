import { createFileRoute } from "@tanstack/react-router";

import { AdministrativePage } from "@/components/administrative-pages";

export const Route = createFileRoute("/_authenticated/flats")({
  head: () => ({
    meta: [
      { title: "Flats — NestInLedger" },
      {
        name: "description",
        content:
          "Flat details, occupancy and linked owners for your apartment society.",
      },
      { property: "og:title", content: "Flats — NestInLedger" },
      {
        property: "og:description",
        content: "Apartment flat records and occupancy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Flats,
});

function Flats() {
  return <AdministrativePage page="flats" />;
}
