import { createFileRoute } from "@tanstack/react-router";
import { trackClick } from "@/server/public";

// Tracked links: records the click, then redirects only to a link the campaign
// contains, or to a personal-block link signed for this delivery (`s`).
export const Route = createFileRoute("/t/c/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const query = new URL(request.url).searchParams;
        const target = await trackClick(params.id, query.get("u") ?? "", query.get("s") ?? "");
        if (!target) return new Response("Unknown link", { status: 400 });
        return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
      },
    },
  },
});
