import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/push-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyHookToken } = await import("@/lib/email-hooks.server");
        if (!(await verifyHookToken(request))) return new Response("Unauthorized", { status: 401 });
        const { retryDuePushes } = await import("@/lib/web-push.server");
        return Response.json(await retryDuePushes());
      },
    },
  },
});
