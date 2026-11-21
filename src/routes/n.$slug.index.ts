import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { canonicalHome } from "@/lib/canonical";
import { publicNewsletter, siteIssues } from "@/server/public";
import { notFoundPage, publicPage, SignupForm } from "@/server/publicPage";

// A newsletter's public home: its sent web issues, newest first, and the signup form.
export const Route = createFileRoute("/n/$slug/")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { slug: string } }) => {
        const newsletter = await publicNewsletter(params.slug);
        if (!newsletter) return notFoundPage();
        const canonical = canonicalHome(newsletter.slug);
        if (canonical) return Response.redirect(canonical, 301);
        const issues = await siteIssues(newsletter.id);
        return publicPage(
          newsletter.name,
          h("div", { className: "space-y-10" }, [
            h("header", { key: "h", className: "space-y-4" }, [
              h("h1", { key: "t", className: "text-3xl font-semibold tracking-tight" }, newsletter.name),
              newsletter.description ? h("p", { key: "d", className: "text-muted-foreground" }, newsletter.description) : null,
              h(SignupForm, { key: "f", slug: newsletter.slug }),
            ]),
            h(
              "section",
              { key: "i", className: "space-y-1" },
              issues.length
                ? issues.map((issue) =>
                    h("a", { key: issue.slug, href: `/n/${newsletter.slug}/p/${issue.slug}`, className: "block rounded-lg px-3 py-3 -mx-3 hover:bg-muted" }, [
                      h("div", { key: "s", className: "font-medium" }, issue.subject),
                      h("div", { key: "m", className: "text-sm text-muted-foreground" }, [
                        issue.sentAt ? new Date(issue.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
                        issue.previewText ? ` · ${issue.previewText}` : "",
                      ]),
                    ]),
                  )
                : h("p", { className: "text-sm text-muted-foreground" }, "No issues yet."),
            ),
          ]),
        );
      },
    },
  },
});
