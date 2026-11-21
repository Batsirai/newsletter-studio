import { createElement as h } from "react";
import { unsubscribe } from "./public";
import { Message, notFoundPage, PostButton, publicPage } from "./publicPage";

export async function unsubscribeResponse(request: Request, slug: string, token: string): Promise<Response> {
  const d = new URL(request.url).searchParams.get("d");
  const found = await unsubscribe(slug, token, d);
  if (!found) return notFoundPage();
  return publicPage(
    "Unsubscribed",
    h(Message, { title: "You're unsubscribed" }, [
      h("p", { key: "p" }, `${found.contact.email} won't receive ${found.newsletter.name} any more.`),
      h(PostButton, { key: "b", action: `/n/${slug}/resubscribe/${token}`, label: "Resubscribe" }),
    ]),
  );
}
