import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { signupInput, subscribe } from "@/server/public";
import { Message, notFoundPage, publicPage } from "@/server/publicPage";

// The signup form's target, from the newsletter's site or a form embedded elsewhere.
export const Route = createFileRoute("/n/$slug/subscribe")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { slug: string } }) => {
        const form = await request.formData().catch(() => null);
        if (!form) return publicPage("Sign up", h(Message, { title: "Enter your email to sign up" }), 400);
        const back = h("p", null, h("a", { href: `/n/${params.slug}`, className: "text-primary underline" }, "Back"));
        // A bot fills the hidden field; it gets the same answer and nothing is stored.
        if (String(form.get("website") ?? "")) {
          return publicPage("Check your inbox", h(Message, { title: "Check your inbox" }));
        }
        const parsed = signupInput.safeParse({
          email: String(form.get("email") ?? ""),
          firstName: String(form.get("first_name") ?? ""),
          tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          source: form.get("source") === "website" ? "website" : "embed",
        });
        if (!parsed.success) return publicPage("Sign up", h(Message, { title: "That email doesn't look right" }, back), 400);
        const state = await subscribe(params.slug, parsed.data, new URL(request.url).origin);
        if (!state) return notFoundPage();
        return state === "pending"
          ? publicPage("Check your inbox", h(Message, { title: "Check your inbox" }, h("p", null, `We sent a link to ${parsed.data.email}. Open it to confirm your subscription.`)))
          : publicPage("Subscribed", h(Message, { title: "You're subscribed" }, back));
      },
    },
  },
});
