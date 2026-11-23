import { describe, expect, it, vi } from "vitest";
import { FALLBACK_FOOTER, fetchFooters, sameLink, type Footer } from "./footer";
import { renderIssue } from "./issueEmail";

// No "New from us" line under the personal block any more (founder, 2026-11-21:
// "one CTA per email. Remove the new from us"). An app that still sends `news`
// must not break the block.

const NEWS_URL = "https://alreadylovedkids.com/blog/bedtime-words?utm_source=email&utm_medium=footer&utm_campaign=new_from_us";
const footer: Footer = {
  firstName: "Sarah",
  state: "share",
  greeting: "Hi Sarah,",
  coverUrl: "https://home.alreadylovedkids.com/covers/b1.jpg",
  coverAlt: "Mia's book cover",
  headline: "Share your book with family and friends.",
  buttonLabel: "Share Your Book",
  buttonUrl: "https://home.alreadylovedkids.com/share/abc?utm_source=email&utm_medium=footer&utm_campaign=next_step_share",
  bookshelfUrl: "https://home.alreadylovedkids.com/home?utm_source=email&utm_medium=footer&utm_campaign=next_step_share",
};
const withNews: Footer = { ...footer, news: { title: "Bedtime & the words we keep", url: NEWS_URL } };

const parts = {
  newsletter: { name: "AlreadyLoved Letters", slug: "letters", postalAddress: "1 Road, Town" },
  campaign: { id: "c1", subject: "Hello", previewText: "A week", body: "# Week\n\nHello." },
  contact: { firstName: "Sarah", token: "tok" },
  deliveryId: "d1",
  origin: "https://studio.test",
  webUrl: null as string | null,
};

describe("sameLink", () => {
  it("compares without the query string, the fragment and a trailing slash", () => {
    expect(sameLink(NEWS_URL, "https://alreadylovedkids.com/blog/bedtime-words")).toBe(true);
    expect(sameLink("https://alreadylovedkids.com/blog/bedtime-words/", "https://alreadylovedkids.com/blog/bedtime-words#top")).toBe(true);
    expect(sameLink(NEWS_URL, "https://alreadylovedkids.com/blog/other")).toBe(false);
    expect(sameLink(NEWS_URL, null)).toBe(false);
  });
});

describe("renderIssue", () => {
  it("shows no news line, even when the app sends one", async () => {
    for (const block of [withNews, footer, FALLBACK_FOOTER]) {
      const { html, text } = await renderIssue({ ...parts, footer: { block, key: "k" } });
      expect(html).toContain("data-personal-block");
      expect(html).not.toContain("New from us");
      expect(html).not.toContain(encodeURIComponent(NEWS_URL));
      expect(text).not.toContain("New from us");
    }
  });
});

describe("fetchFooters and news", () => {
  const config = { url: "https://app.test/api/email-footers", secret: "s" };
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

  it("keeps the news the app answers with", async () => {
    const out = await fetchFooters(["a@x.test"], config, { fetch: ok({ footers: [withNews] }) });
    expect(out?.[0]?.news).toEqual(withNews.news);
  });

  it("still sends the personal block when an older app answers without news, or with null", async () => {
    const out = await fetchFooters(["a@x.test", "b@x.test"], config, {
      fetch: ok({ footers: [footer, { ...footer, news: null }] }),
    });
    expect(out?.map((f) => f.state)).toEqual(["share", "share"]);
    expect(out?.map((f) => f.news ?? null)).toEqual([null, null]);
  });

  it("drops a malformed news field without losing the block", async () => {
    const out = await fetchFooters(["a@x.test"], config, { fetch: ok({ footers: [{ ...footer, news: { title: 5 } }] }) });
    expect(out?.[0]?.state).toBe("share");
    expect(out?.[0]?.news ?? null).toBeNull();
  });
});
