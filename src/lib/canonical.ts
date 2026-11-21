/**
 * Newsletters whose public copy lives on another site. Their Studio pages
 * redirect there, and feeds and emails link there, so search engines and
 * readers only see one version of each issue.
 */
const SITES: Record<string, { home: string; issue: (slug: string) => string }> = {
  // AlreadyLoved Letters live in the alreadylovedkids.com blog, tagged Letters.
  batsirai: {
    home: "https://alreadylovedkids.com/letters",
    issue: (slug) => `https://alreadylovedkids.com/blog/${encodeURIComponent(slug)}`,
  },
};

export function canonicalHome(newsletterSlug: string): string | null {
  return SITES[newsletterSlug]?.home ?? null;
}

export function canonicalIssue(newsletterSlug: string, issueSlug: string): string | null {
  return SITES[newsletterSlug]?.issue(issueSlug) ?? null;
}
