import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { signupConfig } from "@/server/signupClaims";
import { signupConfirmationResponse } from "@/server/signupConfirmationPage";

async function response({
  request,
  params,
}: {
  request: Request;
  params: { slug: string; token: string };
}) {
  try {
    return await signupConfirmationResponse(
      request,
      params,
      signupConfig(env as unknown as Record<string, unknown>),
    );
  } catch {
    return new Response("Newsletter confirmation is temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
export const Route = createFileRoute("/n/$slug/join/$token")({
  server: { handlers: { GET: response, POST: response } },
});
