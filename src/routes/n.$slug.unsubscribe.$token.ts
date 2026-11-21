import { createFileRoute } from "@tanstack/react-router";
import { unsubscribeResponse } from "@/server/unsubscribePage";

type Args = { request: Request; params: { slug: string; token: string } };

// The unsubscribe link in every issue (GET) and the one-click header (POST).
export const Route = createFileRoute("/n/$slug/unsubscribe/$token")({
  server: {
    handlers: {
      GET: ({ request, params }: Args) => unsubscribeResponse(request, params.slug, params.token),
      POST: ({ request, params }: Args) => unsubscribeResponse(request, params.slug, params.token),
    },
  },
});
