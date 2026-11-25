import { createFileRoute } from "@tanstack/react-router";
import { SocietyDocuments } from "@/components/society-documents";
import { LegalDocuments, legalDocumentsQuery } from "@/components/legal-documents";
import { useSessionRole } from "@/lib/session";
export const Route = createFileRoute("/_authenticated/documents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(legalDocumentsQuery),
  head: () => ({ meta: [
    { title: "Documents — NestInLedger" }, { name: "description", content: "Society documents and records." },
    { property: "og:title", content: "Documents — NestInLedger" }, { property: "og:description", content: "Society documents and records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DocumentsPage,
});
function DocumentsPage() {
  const { societyName } = useSessionRole();
  return <main className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-6xl"><p className="text-sm uppercase text-muted-foreground">{societyName || "Your apartment"}</p><h1 className="mt-1 text-4xl font-bold">Documents</h1><SocietyDocuments /><LegalDocuments /></div></main>;
}
