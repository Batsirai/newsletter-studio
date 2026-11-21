import { z } from "zod";
import { escapeHtml, slugify } from "./markdown";

export interface ImportPost {
  subject: string;
  previewText: string;
  slug: string;
  sentAt: string;
  body: string;
}

const postShape = z.object({
  subject: z.string().trim().min(1).max(300),
  previewText: z.string().max(300).nullish(),
  slug: z.string().nullish(),
  sentAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  body: z.string().min(1).max(200_000),
});

/**
 * Reads a JSON array of past posts. A post without a subject, body or valid
 * date is counted as invalid; a second post with the same slug is counted as
 * repeated. Slugs come from the file, or from the subject when missing.
 */
export function parsePostsJson(text: string): {
  rows: ImportPost[];
  invalid: number;
  repeated: number;
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON");
  }
  if (!Array.isArray(data))
    throw new Error("The file must hold a list of posts");
  const rows: ImportPost[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let repeated = 0;
  for (const item of data) {
    const parsed = postShape.safeParse(item);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const p = parsed.data;
    const slug = slugify(p.slug || p.subject);
    if (seen.has(slug)) {
      repeated++;
      continue;
    }
    seen.add(slug);
    rows.push({
      subject: p.subject,
      previewText: p.previewText ?? "",
      slug,
      sentAt: new Date(p.sentAt).toISOString(),
      body: p.body,
    });
  }
  return { rows, invalid, repeated };
}

export interface FeedIssue {
  subject: string;
  slug: string;
  previewText: string;
  sentAt: string | null;
  url: string;
  html: string;
  /** The issue's Markdown source, so a site can render it in its own template. */
  markdown?: string;
}

/** An RSS 2.0 document for a newsletter's web issues, newest first. */
export function buildRss(
  channel: { title: string; description: string; link: string },
  issues: FeedIssue[],
): string {
  const items = issues
    .map(
      (i) =>
        `<item><title>${escapeHtml(i.subject)}</title><link>${escapeHtml(i.url)}</link><guid isPermaLink="true">${escapeHtml(i.url)}</guid>` +
        (i.sentAt
          ? `<pubDate>${new Date(i.sentAt).toUTCString()}</pubDate>`
          : "") +
        `<description>${escapeHtml(i.previewText)}</description><content:encoded><![CDATA[${i.html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded></item>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>` +
    `<title>${escapeHtml(channel.title)}</title><link>${escapeHtml(channel.link)}</link><description>${escapeHtml(channel.description)}</description>` +
    `${items}</channel></rss>`
  );
}
