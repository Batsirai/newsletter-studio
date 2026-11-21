import { createFileRoute } from "@tanstack/react-router";
import { newsletterFeed, rssResponse } from "@/server/feed";

// A newsletter's web issues as RSS 2.0.
export const Route = createFileRoute("/n/$slug/rss")({
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
        if (!feed) return new Response("Not found", { status: 404 });
        return rssResponse(feed);
      },
    },
  },
});
