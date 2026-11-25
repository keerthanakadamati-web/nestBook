import { createFileRoute } from "@tanstack/react-router";
import { AdministrativePage } from "@/components/administrative-pages";
export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [
    { title: "Payments — NestInLedger" }, { name: "description", content: "Cash payments, UPI confirmations and receipts." },
    { property: "og:title", content: "Payments — NestInLedger" }, { property: "og:description", content: "Cash payments, UPI confirmations and receipts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: () => <AdministrativePage page="payments" />,
});