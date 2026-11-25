import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { listComplaints } from "@/lib/complaints.functions";
import { ComplaintsPage } from "@/components/complaints-page";

export const complaintOptions = queryOptions({ queryKey: ["complaints"], queryFn: () => listComplaints() });
export const Route = createFileRoute("/_authenticated/complaints")({
  head: () => ({ meta: [
    { title: "Complaints — NestInLedger" }, { name: "description", content: "Private apartment complaints, committee responses and resolution history." },
    { property: "og:title", content: "Complaints — NestInLedger" }, { property: "og:description", content: "Track your apartment complaints and committee updates securely." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(complaintOptions),
  errorComponent: ({ reset }) => {
    const router = useRouter();
    return (
      <main className="p-10 space-y-3">
        <p className="text-muted-foreground">Could not load complaints. Please check your connection and try again.</p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => { router.invalidate(); reset(); }}
        >
          Try again
        </button>
      </main>
    );
  },
  component: ComplaintsPage,
});