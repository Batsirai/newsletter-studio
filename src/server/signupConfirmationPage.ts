import { createElement as h } from "react";
import { buttonVariants } from "@/client/components/ui/button";
import {
  confirmSignup,
  confirmationView,
  type SignupConfig,
} from "./signupClaims";
import { Message, notFoundPage, publicPage } from "./publicPage";

export async function signupConfirmationResponse(
  request: Request,
  params: { slug: string; token: string },
  config: SignupConfig,
): Promise<Response> {
  const noStore = (response: Response) => {
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (request.method !== "GET" && request.method !== "POST")
    return noStore(new Response("Method not allowed", { status: 405 }));
  let found;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== config.origin)
      return noStore(
        new Response("Invalid confirmation origin", { status: 403 }),
      );
    const form = await request.formData().catch(() => null);
    if (form?.get("confirm") !== "yes")
      return noStore(
        new Response("Choose confirm to subscribe", { status: 400 }),
      );
    found = await confirmSignup(params.slug, params.token, config);
  } else found = await confirmationView(params.slug, params.token, config);
  if (!found) return noStore(notFoundPage());
  if (found.status === "pending")
    return noStore(
      publicPage(
        "Confirm your newsletter choice",
        h(
          Message,
          { title: `Would you like ${found.name}?` },
          h(
            "p",
            null,
            "Confirm below to receive the newsletter. Your free playbook is available separately.",
          ),
          h(
            "form",
            {
              method: "post",
              action: `/n/${encodeURIComponent(params.slug)}/join/${params.token}`,
            },
            h(
              "button",
              {
                type: "submit",
                name: "confirm",
                value: "yes",
                className: buttonVariants(),
              },
              "Confirm my subscription",
            ),
          ),
        ),
      ),
    );
  const title =
    found.status === "active"
      ? "Subscription confirmed"
      : found.status === "expired"
        ? "This confirmation link has expired"
        : "This signup cannot be confirmed";
  return noStore(publicPage(title, h(Message, { title })));
}
