import { describe, expect, it, vi } from "vitest";
import {
  FALLBACK_FOOTER,
  fetchFooters,
  footerText,
  renderFooterBlock,
  sampleFooter,
  signClick,
  verifyClick,
  type Footer,
} from "./footer";

const finish: Footer = {
  firstName: "Sarah",
  state: "finish",
  greeting: "Hi Sarah,",
  coverUrl: "https://home.alreadylovedkids.com/covers/b1.jpg",
  coverAlt: "Mia's book cover",
  headline: "Mia's book is waiting for you.",
  buttonLabel: "Preview Your Child's Book",
  buttonUrl: "https://home.alreadylovedkids.com/home?utm_source=email&utm_medium=footer&utm_campaign=next_step_finish",
  bookshelfUrl: "https://home.alreadylovedkids.com/home?utm_source=email&utm_medium=footer&utm_campaign=next_step_finish",
};

describe("renderFooterBlock", () => {
  it("shows the greeting, a linked 200px rounded cover, the headline, one button and the bookshelf link, in that order", () => {
    const html = renderFooterBlock(finish);
    const order = ["Hi Sarah,", `src="${finish.coverUrl}"`, "Mia&#39;s book is waiting for you.", "Preview Your Child&#39;s Book", "Your bookshelf"];
    const at = order.map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('width="200"');
    expect(html).toContain("border-radius:8px");
    expect(html).toMatch(/<a href="[^"]+"[^>]*><img /);
    expect(html.match(/data-button/g)).toHaveLength(1);
    expect(html).toContain("data-personal-block");
  });

  it("renders each state with its own words", () => {
    for (const state of ["start", "finish", "share"] as const) {
      const footer = sampleFooter(state, "");
      const html = renderFooterBlock(footer);
      expect(html).toContain(footer.buttonLabel.replaceAll("'", "&#39;"));
    }
    expect(sampleFooter("start", "").buttonLabel).toBe("Make Your Child's Book");
    expect(sampleFooter("finish", "").buttonLabel).toBe("Preview Your Child's Book");
    expect(sampleFooter("share", "").buttonLabel).toBe("Share Your Book");
  });

  it("reads well without a name: no greeting line, no placeholder", () => {
    const html = renderFooterBlock(FALLBACK_FOOTER);
    expect(html).not.toContain("Hi ");
    expect(html).not.toMatch(/\{\{|undefined|null/);
    expect(html).toContain("Come and see what your child&#39;s book looks like.");
    expect(html).toContain("Make Your Child&#39;s Book");
  });

  it("escapes every value", () => {
    const html = renderFooterBlock({
      ...finish,
      greeting: "Hi <b>Sam</b>,",
      coverAlt: '"><script>x</script>',
      headline: "<img src=x onerror=alert(1)>",
      buttonLabel: "Go & see",
      buttonUrl: 'https://a.test/x?a=1&b="2"',
    });
    expect(html).not.toContain("<b>Sam</b>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Hi &lt;b&gt;Sam&lt;/b&gt;,");
    expect(html).toContain("Go &amp; see");
    expect(html).toContain('href="https://a.test/x?a=1&amp;b=&quot;2&quot;"');
  });

  it("drops a link or picture that is not http(s)", () => {
    const html = renderFooterBlock({
      ...finish,
      coverUrl: "javascript:alert(1)",
      buttonUrl: "javascript:alert(2)",
      bookshelfUrl: "data:text/html,hi",
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-button");
    expect(html).not.toContain("Your bookshelf");
    expect(html).toContain("Mia&#39;s book is waiting for you.");
  });

  it("sends each link through the tracker it is given", () => {
    const html = renderFooterBlock(finish, (url) => `https://studio.test/t/c/d1?u=${encodeURIComponent(url)}`);
    expect(html).not.toContain(`href="${finish.buttonUrl}"`);
    expect(html).toContain(`href="https://studio.test/t/c/d1?u=${encodeURIComponent(finish.buttonUrl)}"`);
    // The picture itself is not a tracked click, only its link.
    expect(html).toContain(`src="${finish.coverUrl}"`);
  });

  it("uses no emoji", () => {
    for (const state of ["start", "finish", "share"] as const) {
      expect(renderFooterBlock(sampleFooter(state, "Ana"))).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("footer copy", () => {
  it("keeps the voice rules", () => {
    const words = (["start", "finish", "share"] as const)
      .map((s) => sampleFooter(s, "Ana"))
      .concat(FALLBACK_FOOTER)
      .map((f) => `${f.greeting} ${f.headline} ${f.buttonLabel} ${f.coverAlt}`)
      .join(" ");
    expect(words).not.toMatch(/free book|\bden\b|hurry|last chance|don't miss|only \d|today only/i);
  });

  it("keeps the agreed fallback", () => {
    expect(FALLBACK_FOOTER).toEqual({
      firstName: "",
      state: "start",
      greeting: "",
      coverUrl: "https://home.alreadylovedkids.com/images/email/sample-cover-ava.jpg",
      coverAlt: "A sample AlreadyLoved book cover",
      headline: "Come and see what your child's book looks like.",
      buttonLabel: "Make Your Child's Book",
      buttonUrl: "https://home.alreadylovedkids.com/welcome?utm_source=email&utm_medium=footer&utm_campaign=next_step_start",
      bookshelfUrl: "https://home.alreadylovedkids.com/home?utm_source=email&utm_medium=footer&utm_campaign=next_step_start",
    });
  });

  it("greets the sender by first name in a sample, and not at all without one", () => {
    expect(sampleFooter("finish", "Batsirai").greeting).toBe("Hi Batsirai,");
    expect(sampleFooter("finish", "  ").greeting).toBe("");
    expect(sampleFooter("share", "").coverUrl).toBe(FALLBACK_FOOTER.coverUrl);
  });
});

describe("footerText", () => {
  it("is the headline and the button link", () => {
    expect(footerText(finish)).toBe(`Hi Sarah,\nMia's book is waiting for you.\nPreview Your Child's Book: ${finish.buttonUrl}`);
    expect(footerText(FALLBACK_FOOTER)).toBe(`Come and see what your child's book looks like.\nMake Your Child's Book: ${FALLBACK_FOOTER.buttonUrl}`);
  });
  it("leaves out a link that is not http(s)", () => {
    expect(footerText({ ...finish, greeting: "", buttonUrl: "javascript:x" })).toBe("Mia's book is waiting for you.");
  });
});

describe("fetchFooters", () => {
  const config = { url: "https://app.test/api/email-footers", secret: "s3cret" };
  const ok = (body: unknown, status = 200) =>
    vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("asks once with the bearer secret and returns the footers in order", async () => {
    const other = { ...finish, firstName: "", greeting: "", state: "start" as const };
    const fetchImpl = ok({ footers: [finish, other] });
    const out = await fetchFooters(["a@x.test", "b@x.test"], config, { fetch: fetchImpl });
    expect(out).toEqual([finish, other]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(config.url);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer s3cret");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ emails: ["a@x.test", "b@x.test"] });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("is null when the address or the secret is not set, and asks nothing", async () => {
    const fetchImpl = ok({ footers: [] });
    expect(await fetchFooters(["a@x.test"], { url: "", secret: "s" }, { fetch: fetchImpl })).toBeNull();
    expect(await fetchFooters(["a@x.test"], { url: config.url, secret: undefined }, { fetch: fetchImpl })).toBeNull();
    expect(await fetchFooters(["a@x.test"], { url: "http://app.test/x", secret: "s" }, { fetch: fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks nothing for an empty batch", async () => {
    const fetchImpl = ok({ footers: [] });
    expect(await fetchFooters([], config, { fetch: fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to the start block for everyone on a 500", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await fetchFooters(["a@x.test", "b@x.test"], config, { fetch: ok({ error: "x" }, 500) });
    expect(out).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("@x.test");
    warn.mockRestore();
  });

  it("falls back when the app does not answer in time, without waiting longer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hang = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const started = Date.now();
    const out = await fetchFooters(["a@x.test"], config, { fetch: hang, timeoutMs: 50 });
    expect(out).toEqual([FALLBACK_FOOTER]);
    expect(Date.now() - started).toBeLessThan(1000);
    warn.mockRestore();
  });

  it("falls back on a bad shape, a wrong count or a network error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const two = ["a@x.test", "b@x.test"];
    expect(await fetchFooters(two, config, { fetch: ok({ footers: [{ ...finish, state: "done" }, finish] }) })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    expect(await fetchFooters(two, config, { fetch: ok({ footers: [finish] }) })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    expect(await fetchFooters(two, config, { fetch: ok([finish, finish]) })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    expect(await fetchFooters(two, config, { fetch: ok({ footers: [{ ...finish, headline: 3 }, finish] }) })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    const broken = vi.fn(async () => new Response("not json", { status: 200 }));
    expect(await fetchFooters(two, config, { fetch: broken })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchFooters(two, config, { fetch: offline })).toEqual([FALLBACK_FOOTER, FALLBACK_FOOTER]);
    warn.mockRestore();
  });
});

describe("signed footer clicks", () => {
  it("accepts the link it signed, for that delivery only", async () => {
    const sig = await signClick("key", "d1", finish.buttonUrl);
    expect(await verifyClick("key", "d1", finish.buttonUrl, sig)).toBe(true);
    expect(await verifyClick("key", "d2", finish.buttonUrl, sig)).toBe(false);
    expect(await verifyClick("key", "d1", "https://evil.test/", sig)).toBe(false);
    expect(await verifyClick("other", "d1", finish.buttonUrl, sig)).toBe(false);
    expect(await verifyClick("key", "d1", finish.buttonUrl, "")).toBe(false);
    expect(await verifyClick("", "d1", finish.buttonUrl, sig)).toBe(false);
  });
});
