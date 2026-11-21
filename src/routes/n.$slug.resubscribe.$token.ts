import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { resubscribe } from "@/server/public";
import { Message, notFoundPage, publicPage } from "@/server/publicPage";

export const Route = createFileRoute("/n/$slug/resubscribe/$token")({
  server: {
    handlers: {
      POST: async ({ params }: { params: { slug: string; token: string } }) => {
        const found = await resubscribe(params.slug, params.token);
        if (!found) return notFoundPage();
        return publicPage("Subscribed", h(Message, { title: "You're subscribed again" }));
      },
    },
  },
});
