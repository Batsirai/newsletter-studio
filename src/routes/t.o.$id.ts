import { createFileRoute } from "@tanstack/react-router";
import { trackOpen } from "@/server/public";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

// The open pixel in each issue email.
export const Route = createFileRoute("/t/o/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        await trackOpen(params.id);
        return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
      },
    },
  },
});
