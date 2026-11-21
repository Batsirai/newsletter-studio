import { describe, expect, it } from "vitest";
import { linksIn, mergeTags, renderMarkdown, slugify } from "./markdown";
import { reviewCampaign } from "./review";
import { zonedTimeToUtc } from "./schedule";

describe("markdown", () => {
  it("renders headings, links, images and buttons, and escapes HTML", () => {
    const html = renderMarkdown("# Hi\n\n<script>x</script> [a](https://a.test/x)\n\n![p](https://img.test/p.png)\n\n[[Go]](https://b.test)");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<a href="https://a.test/x">a</a>');
    expect(html).toContain('<img src="https://img.test/p.png"');
    expect(html).toContain("data-button");
  });
  it("drops unsafe link schemes and rewrites links", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("href");
    expect(renderMarkdown("[x](https://a.test)", { link: (u) => `/t?u=${u}` })).toContain('href="/t?u=https://a.test"');
  });
  it("lists links and fills merge tags", () => {
    expect(linksIn("[a](https://a.test) [[B]](https://b.test) ![i](https://i.test)")).toEqual(["https://a.test", "https://b.test"]);
    expect(mergeTags("Hi {{first_name|friend}}", {})).toBe("Hi friend");
    expect(mergeTags("Hi {{ first_name | friend }}", { first_name: "Ana" })).toBe("Hi Ana");
    expect(slugify("Tomatoes, seeds & frost!")).toBe("tomatoes-seeds-frost");
  });
});

describe("review", () => {
  const ok = { subject: "Hello", previewText: "p", body: "Body", fromName: "A", postalAddress: "1 Road", segmentMissing: false, testSent: true, destination: "both" };
  it("passes a complete campaign", () => expect(reviewCampaign(ok)).toEqual([]));
  it("blocks missing parts and warns on placeholders", () => {
    const items = reviewCampaign({ ...ok, subject: "", postalAddress: "", segmentMissing: true, body: "Lorem ipsum [x](#)", testSent: false });
    expect(items.filter((i) => i.level === "blocking")).toHaveLength(3);
    expect(items.map((i) => i.message).join(" ")).toMatch(/Broken link.*placeholder text/s);
  });
});

describe("schedule", () => {
  it("converts a wall-clock time in a zone to UTC", () => {
    expect(zonedTimeToUtc("2026-07-01", "09:15", "Europe/London").toISOString()).toBe("2026-07-01T08:15:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
});
