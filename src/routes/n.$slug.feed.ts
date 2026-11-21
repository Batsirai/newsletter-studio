import { createFileRoute } from "@tanstack/react-router";
import { feedHeaders, newsletterFeed } from "@/server/feed";

// A newsletter's web issues as JSON, newest first, for other sites to show.
export const Route = createFileRoute("/n/$slug/feed")({
  server: {
    handlers: {
      GET: async ({
        params,
        request,
      }: {
        params: { slug: string };
        request: Request;
      }) => {
        const feed = await newsletterFeed(
          params.slug,
          new URL(request.url).origin,
        );
        if (!feed)
          return Response.json(
            { error: "Not found" },
            { status: 404, headers: feedHeaders },
          );
        return Response.json(feed, { headers: feedHeaders });
      },
    },
  },
});
