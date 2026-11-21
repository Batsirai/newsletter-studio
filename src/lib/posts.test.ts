import { describe, expect, it } from "vitest";
import { buildRss, parsePostsJson } from "./posts";

describe("parsePostsJson", () => {
  it("keeps valid posts, makes slugs, and counts invalid and repeated ones", () => {
    const text = JSON.stringify([
      {
        subject: "Thank God for Normal",
        slug: "thank-god-for-normal",
        previewText: "Plains",
        sentAt: "2026-11-20T22:43:36Z",
        body: "Hello",
      },
      {
        subject: "No Slug Here!",
        sentAt: "2026-11-13T12:00:00Z",
        body: "Body",
      },
      {
        subject: "Again",
        slug: "thank-god-for-normal",
        sentAt: "2026-11-01T00:00:00Z",
        body: "x",
      },
      { subject: "", sentAt: "2026-11-01T00:00:00Z", body: "x" },
      { subject: "Bad date", sentAt: "soon", body: "x" },
      { subject: "No body", sentAt: "2026-11-01T00:00:00Z", body: "" },
    ]);
    const r = parsePostsJson(text);
    expect(r.rows.map((p) => p.slug)).toEqual([
      "thank-god-for-normal",
      "no-slug-here",
    ]);
    expect(r.rows[0]).toMatchObject({
      previewText: "Plains",
      sentAt: "2026-11-20T22:43:36.000Z",
      body: "Hello",
    });
    expect(r.rows[1]?.previewText).toBe("");
    expect(r.invalid).toBe(3);
    expect(r.repeated).toBe(1);
  });

  it("refuses text that is not a JSON list", () => {
    expect(() => parsePostsJson("nope")).toThrow("not valid JSON");
    expect(() => parsePostsJson("{}")).toThrow("list of posts");
  });
});

describe("buildRss", () => {
  it("escapes titles and wraps the html in CDATA", () => {
    const xml = buildRss(
      { title: "A & B", description: "d", link: "https://x.test/n/a" },
      [
        {
          subject: "Fish <and> chips",
          slug: "f",
          previewText: "p",
          sentAt: "2026-11-20T00:00:00Z",
          url: "https://x.test/n/a/p/f",
          html: "<p>hi ]]> there</p>",
        },
      ],
    );
    expect(xml).toContain("<title>A &amp; B</title>");
    expect(xml).toContain("<title>Fish &lt;and&gt; chips</title>");
    expect(xml).toContain("<pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("<![CDATA[<p>hi ]]]]><![CDATA[> there</p>]]>");
  });
});

describe("FeedIssue markdown", () => {
  it("keeps the Markdown source out of the RSS body", () => {
    const rss = buildRss(
      { title: "T", description: "", link: "https://x.test" },
      [{ subject: "S", slug: "s", previewText: "", sentAt: null, url: "https://x.test/p/s", html: "<p>Hi</p>", markdown: "**Hi**" }],
    );
    expect(rss).toContain("<p>Hi</p>");
    expect(rss).not.toContain("**Hi**");
  });
});
