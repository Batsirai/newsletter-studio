import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { contactFilter, exportContactsCsv } from "@/server/contacts";
import { NotFoundError } from "@/server/newsletters";

// The contacts list as CSV, with the same filters as the page.
export const Route = createFileRoute("/export/contacts/$newsletterId")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { newsletterId: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const search = Object.fromEntries(new URL(request.url).searchParams);
        const filter = contactFilter.safeParse({ ...search, page: undefined, newsletterId: params.newsletterId });
        if (!filter.success) return new Response("Bad filter", { status: 400 });
        try {
          const csv = await exportContactsCsv(user.id, filter.data);
          return new Response(csv, {
            headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="contacts.csv"' },
          });
        } catch (error) {
          if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
          throw error;
        }
      },
    },
  },
});
