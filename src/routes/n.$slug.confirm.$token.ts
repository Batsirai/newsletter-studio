import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { confirmSubscription } from "@/server/public";
import { Message, notFoundPage, publicPage } from "@/server/publicPage";

// The link in the confirmation email: makes a pending contact active.
export const Route = createFileRoute("/n/$slug/confirm/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { slug: string; token: string } }) => {
        const found = await confirmSubscription(params.slug, params.token, new URL(request.url).origin);
        if (!found) return notFoundPage();
        return publicPage(
          "Subscription confirmed",
          h(Message, { title: "Subscription confirmed" }, h("p", null, `You'll receive ${found.newsletter.name} at ${found.contact.email}.`)),
        );
      },
    },
  },
});
