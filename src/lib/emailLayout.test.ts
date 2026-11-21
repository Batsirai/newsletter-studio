import { describe, expect, it } from "vitest";
import { BRAND, emailLayout } from "./emailLayout";
import { renderMarkdown } from "./markdown";

describe("emailLayout", () => {
  const html = emailLayout({
    title: "AlreadyLoved Letters",
    inner: "<p>Hello</p>",
    footer: "123 Main St",
    preview: "A short preview",
  });

  it("wraps the issue in the brand frame: cream page, banner header, white card", () => {
    expect(html).toContain(`background-color:${BRAND.page}`);
    expect(html).toContain(`background-color:${BRAND.card}`);
    expect(html).toContain(`src="${BRAND.headerUrl}"`);
    expect(html).toContain('alt="AlreadyLoved with Batsirai &amp; Aimee"');
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("123 Main St");
  });

  it("keeps the hidden preview text and escapes it", () => {
    const tricky = emailLayout({ title: "T", inner: "", footer: "", preview: "<b>hi</b>" });
    expect(tricky).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(tricky).toContain("display:none");
  });

  it("uses table layout so Outlook keeps the frame", () => {
    expect(html).toMatch(/<table[^>]*role="presentation"/);
  });

  it("puts a personal block between the card and the footer, and nothing when there is none", () => {
    const withBlock = emailLayout({ title: "T", inner: "<p>Body</p>", footer: "1 Road", block: "<table data-personal-block></table>" });
    expect(withBlock.indexOf("<p>Body</p>")).toBeLessThan(withBlock.indexOf("data-personal-block"));
    expect(withBlock.indexOf("data-personal-block")).toBeLessThan(withBlock.indexOf("1 Road"));
    expect(emailLayout({ title: "T", inner: "<p>Body</p>", footer: "1 Road", block: "" })).toBe(emailLayout({ title: "T", inner: "<p>Body</p>", footer: "1 Road" }));
  });

  it("leaves out the preview block when there is none", () => {
    expect(emailLayout({ title: "T", inner: "", footer: "" })).not.toContain("display:none");
  });
});

describe("branded markdown for email", () => {
  it("styles links, buttons and headings in the brand colours", () => {
    const out = renderMarkdown("# Title\n\nSee [the book](https://example.com).", { email: true });
    expect(out).toContain(`color:${BRAND.ink}`);
    expect(out).toContain(`<a href="https://example.com" style="color:${BRAND.link}`);
  });
});
