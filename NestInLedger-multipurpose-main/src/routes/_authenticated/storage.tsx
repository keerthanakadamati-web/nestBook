import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/storage")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});
