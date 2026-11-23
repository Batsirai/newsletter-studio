import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FALLBACK_FOOTER, sampleFooter, verifyClick, type Footer } from "./footer";
import { renderIssue, renderTest } from "./issueEmail";
import { mergeTags, renderMarkdown } from "./markdown";

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

const parts = {
  newsletter: { name: "AlreadyLoved Letters", slug: "letters", postalAddress: "1 Road, Town" },
  campaign: { id: "c1", subject: "Hello {{first_name|friend}}", previewText: "A week", body: "# Week\n\nRead [the post](https://blog.test/p)." },
  contact: { firstName: "Sarah", token: "tok" },
  deliveryId: "d1",
  origin: "https://studio.test",
  webUrl: null,
};

describe("renderIssue without a footer", () => {
  it("sends exactly as before: no personal block", async () => {
    const email = await renderIssue(parts);
    expect(email.html).not.toContain("data-personal-block");
    expect(email.html).not.toContain("Open your bookshelf");
    expect(email.text).not.toContain("Open your bookshelf");
    expect(email.html).toContain(`https://studio.test/t/c/d1?u=${encodeURIComponent("https://blog.test/p")}`);
    expect(email.text).toBe(`Week\n\nRead the post (https://blog.test/p).\n\n--\n1 Road, Town\nUnsubscribe: https://studio.test/n/letters/unsubscribe/tok?d=d1\n`);
    expect(email.headers["List-Unsubscribe"]).toBe("<https://studio.test/n/letters/unsubscribe/tok?d=d1>");
  });
});

describe("renderIssue with a footer", () => {
  it("puts the block below the letter and above the postal address and unsubscribe link", async () => {
    const { html } = await renderIssue({ ...parts, footer: { block: footer, key: "k" } });
    const body = html.indexOf("Read <a");
    const block = html.indexOf("data-personal-block");
    const address = html.indexOf("1 Road, Town");
    const unsubscribe = html.indexOf(">Unsubscribe</a>");
    expect(body).toBeGreaterThan(0);
    expect(block).toBeGreaterThan(body);
    expect(address).toBeGreaterThan(block);
    expect(unsubscribe).toBeGreaterThan(address);
    expect(html).not.toContain("Hi Sarah,");
    expect(html).toContain(`src="${footer.coverUrl}"`);
  });

  it("tracks the footer links with a signature the click route accepts", async () => {
    const { html } = await renderIssue({ ...parts, footer: { block: footer, key: "k" } });
    expect(html).not.toContain(`href="${footer.buttonUrl.replaceAll("&", "&amp;")}"`);
    const tracked = [...html.matchAll(/href="https:\/\/studio\.test\/t\/c\/d1\?u=([^"&]+)&amp;s=([0-9a-f]+)"/g)];
    const urls = tracked.map((m) => decodeURIComponent(m[1]!));
    expect(urls).toContain(footer.buttonUrl);
    expect(urls).not.toContain(footer.bookshelfUrl);
    for (const m of tracked) {
      expect(await verifyClick("k", "d1", decodeURIComponent(m[1]!), m[2]!)).toBe(true);
    }
    // Body links keep their unsigned form: the click route checks them against the campaign.
    expect(html).toContain(`href="https://studio.test/t/c/d1?u=${encodeURIComponent("https://blog.test/p")}"`);
  });

  it("adds a short text version before the postal address", async () => {
    const { text } = await renderIssue({ ...parts, footer: { block: footer, key: "k" } });
    expect(text).toBe(
      `Week\n\nRead the post (https://blog.test/p).\n\nShare your book with family and friends.\nShare Your Book: ${footer.buttonUrl}\n\n--\n1 Road, Town\nUnsubscribe: https://studio.test/n/letters/unsubscribe/tok?d=d1\n`,
    );
  });

  it("carries the fallback block as it is", async () => {
    const { html } = await renderIssue({ ...parts, footer: { block: FALLBACK_FOOTER, key: "k" } });
    expect(html).toContain("What does your child&#39;s book look like?");
    expect(html).toContain("Make Your Child&#39;s Book");
  });
});

describe("renderTest", () => {
  const newsletter = { name: "AlreadyLoved Letters", postalAddress: "1 Road, Town" };
  const campaign = { subject: "Hello", previewText: "", body: "Hi there." };

  it("is the plain test without a sample", () => {
    const email = renderTest(newsletter, campaign);
    expect(email.subject).toBe("[Test] Hello");
    expect(email.html).not.toContain("data-personal-block");
  });

  it("ends with the sample block for the chosen state, untracked", () => {
    const email = renderTest(newsletter, campaign, sampleFooter("finish", "Batsirai"));
    expect(email.html).toContain("data-personal-block");
    expect(email.html).not.toContain("Hi Batsirai,");
    expect(email.html).toContain("Finish Your Child&#39;s Book");
    expect(email.html).not.toContain("/t/c/");
    expect(email.html.indexOf("data-personal-block")).toBeLessThan(email.html.indexOf("1 Road, Town"));
    expect(email.text).toContain("Finish Your Child's Book: https://");
  });
});

describe("the public web copy", () => {
  it("has no personal block", () => {
    const html = renderMarkdown(mergeTags(parts.campaign.body, {}));
    expect(html).not.toContain("data-personal-block");
    for (const file of ["../routes/n.$slug.p.$issue.ts", "../server/feed.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source).not.toMatch(/footer|issueEmail/i);
    }
  });
});
