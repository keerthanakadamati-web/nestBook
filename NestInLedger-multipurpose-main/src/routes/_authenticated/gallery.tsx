import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/gallery")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});
