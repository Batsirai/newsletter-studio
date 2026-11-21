import { describe, expect, it, vi } from "vitest";
import { FALLBACK_FOOTER, fetchFooters, newsText, renderNewsLine, sameLink, verifyClick, type Footer } from "./footer";
import { renderIssue } from "./issueEmail";

// The "New from us" line under the personal block (AlreadyLoved ticket #1181):
// the newest letter or article, as the app answers it in `news`.

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

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));

describe("renderNewsLine", () => {
  it("is one line: 'New from us:' then the title as the link, escaped", () => {
    const html = renderNewsLine(withNews.news!);
    expect(html).toMatch(/New from us: <a href="[^"]+"[^>]*>Bedtime &amp; the words we keep<\/a>/);
    expect(hrefs(html)).toEqual([NEWS_URL]);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("sends the link through the tracker and drops a link that is not http(s)", () => {
    expect(hrefs(renderNewsLine(withNews.news!, (u) => `https://t.test/?u=${encodeURIComponent(u)}`))).toEqual([
      `https://t.test/?u=${encodeURIComponent(NEWS_URL)}`,
    ]);
    expect(renderNewsLine({ title: "T", url: "javascript:alert(1)" })).toBe("");
    expect(renderNewsLine({ title: " ", url: NEWS_URL })).toBe("");
  });

  it("has a plain-text form", () => {
    expect(newsText(withNews.news!)).toBe(`New from us: Bedtime & the words we keep ${NEWS_URL}`);
    expect(newsText({ title: "T", url: "ftp://x" })).toBe("");
  });
});

describe("sameLink", () => {
  it("compares without the query string, the fragment and a trailing slash", () => {
    expect(sameLink(NEWS_URL, "https://alreadylovedkids.com/blog/bedtime-words")).toBe(true);
    expect(sameLink("https://alreadylovedkids.com/blog/bedtime-words/", "https://alreadylovedkids.com/blog/bedtime-words#top")).toBe(true);
    expect(sameLink(NEWS_URL, "https://alreadylovedkids.com/blog/other")).toBe(false);
    expect(sameLink(NEWS_URL, null)).toBe(false);
  });
});

describe("renderIssue with the news line", () => {
  it("shows the line under the personal block, tracked and signed like the other footer links", async () => {
    const { html, text } = await renderIssue({ ...parts, footer: { block: withNews, key: "k" } });
    const block = html.indexOf("data-personal-block");
    const news = html.indexOf("New from us:");
    expect(block).toBeGreaterThan(-1);
    expect(news).toBeGreaterThan(block);
    expect(news).toBeLessThan(html.indexOf("1 Road, Town"));
    expect(html).not.toContain(`href="${NEWS_URL.replaceAll("&", "&amp;")}"`);
    const tracked = hrefs(html).find((h) => h.includes(encodeURIComponent(NEWS_URL)))!;
    const u = new URL(tracked);
    expect(u.searchParams.get("u")).toBe(NEWS_URL);
    expect(await verifyClick("k", "d1", NEWS_URL, u.searchParams.get("s")!)).toBe(true);
    expect(text).toContain(`New from us: Bedtime & the words we keep ${NEWS_URL}`);
    expect(text.indexOf("New from us:")).toBeGreaterThan(text.indexOf("Share Your Book:"));
    expect(text.indexOf("New from us:")).toBeLessThan(text.indexOf("--\n1 Road, Town"));
  });

  it("skips the line when its link is this issue's own web link", async () => {
    const { html, text } = await renderIssue({
      ...parts,
      webUrl: "https://alreadylovedkids.com/blog/bedtime-words/",
      footer: { block: withNews, key: "k" },
    });
    expect(html).toContain("data-personal-block");
    expect(html).not.toContain("New from us");
    expect(text).not.toContain("New from us");
  });

  it("has no line without news, and the fallback block has none", async () => {
    for (const block of [footer, FALLBACK_FOOTER]) {
      const { html, text } = await renderIssue({ ...parts, footer: { block, key: "k" } });
      expect(html).toContain("data-personal-block");
      expect(html).not.toContain("New from us");
      expect(text).not.toContain("New from us");
    }
    expect(FALLBACK_FOOTER.news ?? null).toBeNull();
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
