import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { mergeTags, renderMarkdown } from "@/lib/markdown";
import { ISSUE_PROSE } from "@/lib/prose";
import { publicNewsletter, siteIssue } from "@/server/public";
import { notFoundPage, publicPage, SignupForm } from "@/server/publicPage";

// One web issue, at a slug made from its subject. Each view is counted.
export const Route = createFileRoute("/n/$slug/p/$issue")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { slug: string; issue: string } }) => {
        const newsletter = await publicNewsletter(params.slug);
        if (!newsletter) return notFoundPage();
        const issue = await siteIssue(newsletter.id, params.issue);
        if (!issue) return notFoundPage();
        return publicPage(
          `${issue.subject} · ${newsletter.name}`,
          h("div", { className: "space-y-10" }, [
            h("a", { key: "b", href: `/n/${newsletter.slug}`, className: "text-sm text-muted-foreground hover:text-foreground" }, newsletter.name),
            h("article", { key: "a", className: "space-y-6" }, [
              h("h1", { key: "t", className: "text-3xl font-semibold tracking-tight" }, mergeTags(issue.subject, {})),
              h("div", { key: "c", className: ISSUE_PROSE, dangerouslySetInnerHTML: { __html: renderMarkdown(mergeTags(issue.body, {})) } }),
            ]),
            h("section", { key: "s", className: "space-y-3 border-t border-border pt-8" }, [
              h("p", { key: "p", className: "text-sm font-medium" }, `Get ${newsletter.name} by email`),
              h(SignupForm, { key: "f", slug: newsletter.slug }),
            ]),
          ]),
        );
      },
    },
  },
});
