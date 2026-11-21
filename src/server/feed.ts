import { canonicalHome, canonicalIssue } from "@/lib/canonical";
import { mergeTags, renderMarkdown } from "@/lib/markdown";
import { buildRss, type FeedIssue } from "@/lib/posts";
import { feedIssues, publicNewsletter } from "./public";

/** A newsletter's web issues, ready for a feed, or null when its site is off. */
export async function newsletterFeed(slug: string, origin: string) {
  const newsletter = await publicNewsletter(slug);
  if (!newsletter) return null;
  const rows = await feedIssues(newsletter.id);
  const link = canonicalHome(newsletter.slug) ?? `${origin}/n/${newsletter.slug}`;
  const issues: FeedIssue[] = rows
    .filter((r) => r.slug)
    .map((r) => ({
      subject: mergeTags(r.subject, {}),
      slug: r.slug as string,
      previewText: r.previewText,
      sentAt: r.sentAt,
      url: canonicalIssue(newsletter.slug, r.slug as string) ?? `${origin}/n/${newsletter.slug}/p/${r.slug}`,
      html: renderMarkdown(mergeTags(r.body, {})),
      markdown: mergeTags(r.body, {}),
    }));
  return {
    title: newsletter.name,
    description: newsletter.description,
    link,
    issues,
  };
}

export const feedHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
  "x-robots-tag": "noindex",
};

export function rssResponse(
  feed: NonNullable<Awaited<ReturnType<typeof newsletterFeed>>>,
) {
  return new Response(buildRss(feed, feed.issues), {
    headers: {
      ...feedHeaders,
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
