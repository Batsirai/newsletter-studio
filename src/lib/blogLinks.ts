/**
 * The AlreadyLoved letters live on alreadylovedkids.com (the blog, tag
 * "Letters"). That is the one public copy: Studio's own issue pages send
 * readers and search engines there instead of showing a second copy.
 */
const BLOG_NEWSLETTERS: Record<string, string> = {
  batsirai: "https://alreadylovedkids.com/blog",
};

/** The blog page for one issue, or null when this newsletter has no blog. */
export function blogIssueUrl(newsletterSlug: string, issueSlug: string): string | null {
  const base = BLOG_NEWSLETTERS[newsletterSlug];
  return base ? `${base}/${issueSlug}` : null;
}

/** The blog's home for a newsletter, or null. */
export function blogHomeUrl(newsletterSlug: string): string | null {
  return BLOG_NEWSLETTERS[newsletterSlug] ?? null;
}
