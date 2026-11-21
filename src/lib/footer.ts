// The personal block at the end of each issue email: the reader's own next step,
// as the AlreadyLoved app answers it (POST {FOOTER_API_URL} with { emails }).
// Pure: no env, no database, so it runs in tests as it runs in the Worker.

import { z } from "zod";
import { BRAND } from "./brand";
import { escapeHtml } from "./markdown";

export const FOOTER_STATES = ["start", "finish", "share"] as const;
export type FooterState = (typeof FOOTER_STATES)[number];

const footerSchema = z.object({
  firstName: z.string(),
  state: z.enum(FOOTER_STATES),
  greeting: z.string(),
  coverUrl: z.string(),
  coverAlt: z.string(),
  headline: z.string(),
  buttonLabel: z.string(),
  buttonUrl: z.string(),
  bookshelfUrl: z.string(),
  // The "New from us" line: the newest letter or article. An older app sends none;
  // a malformed one is dropped so the reader still gets the block.
  news: z.object({ title: z.string(), url: z.string() }).nullish().catch(undefined),
});
export type Footer = z.infer<typeof footerSchema>;

const footersResponse = z.object({ footers: z.array(footerSchema) });

const SITE = "https://home.alreadylovedkids.com";
const utm = (state: FooterState) => `utm_source=email&utm_medium=footer&utm_campaign=next_step_${state}`;
const SAMPLE_COVER = `${SITE}/images/email/sample-cover-ava.jpg`;
const SAMPLE_ALT = "A sample AlreadyLoved book cover";

/** What every reader gets when the app doesn't answer: the start step, no name. */
export const FALLBACK_FOOTER: Footer = {
  firstName: "",
  state: "start",
  greeting: "",
  coverUrl: SAMPLE_COVER,
  coverAlt: SAMPLE_ALT,
  headline: "Come and see what your child's book looks like.",
  buttonLabel: "Make Your Child's Book",
  buttonUrl: `${SITE}/welcome?${utm("start")}`,
  bookshelfUrl: `${SITE}/home?${utm("start")}`,
};

const SAMPLE_WORDS: Record<FooterState, Pick<Footer, "headline" | "buttonLabel" | "buttonUrl">> = {
  start: { headline: FALLBACK_FOOTER.headline, buttonLabel: FALLBACK_FOOTER.buttonLabel, buttonUrl: FALLBACK_FOOTER.buttonUrl },
  finish: { headline: "Your child's book has already begun. Come and see it.", buttonLabel: "Preview Your Child's Book", buttonUrl: `${SITE}/home?${utm("finish")}` },
  share: { headline: "Share your book with family and friends.", buttonLabel: "Share Your Book", buttonUrl: `${SITE}/home?${utm("share")}` },
};

/** A sample block for a test send: the sample cover, the sender's own first name if known. */
export function sampleFooter(state: FooterState, firstName: string): Footer {
  const name = firstName.trim();
  return {
    firstName: name,
    state,
    greeting: name ? `Hi ${name},` : "",
    coverUrl: SAMPLE_COVER,
    coverAlt: SAMPLE_ALT,
    ...SAMPLE_WORDS[state],
    bookshelfUrl: `${SITE}/home?${utm(state)}`,
  };
}

function httpUrl(url: string): string | null {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** The block's HTML, a card of its own under the letter. `track` rewrites each link (click tracking). */
export function renderFooterBlock(footer: Footer, track: (url: string) => string = (url) => url): string {
  const b = BRAND;
  const cover = httpUrl(footer.coverUrl);
  const button = httpUrl(footer.buttonUrl);
  const bookshelf = httpUrl(footer.bookshelfUrl);
  const href = (url: string) => escapeHtml(track(url));
  const img = cover
    ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(footer.coverAlt)}" width="200" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto;border:0;border-radius:8px">`
    : "";
  const rows = [
    footer.greeting.trim() ? `<p style="font-size:16px;line-height:1.6;color:${b.ink};margin:0 0 16px">${escapeHtml(footer.greeting.trim())}</p>` : "",
    img ? `<div style="margin:0 0 18px">${button ? `<a href="${href(button)}" style="text-decoration:none">${img}</a>` : img}</div>` : "",
    `<p style="font-family:${b.heading};font-size:20px;line-height:1.35;font-weight:600;color:${b.ink};margin:0 0 18px">${escapeHtml(footer.headline)}</p>`,
    button
      ? `<p style="margin:0"><a href="${href(button)}" data-button style="display:inline-block;padding:12px 22px;background-color:${b.accent};border-radius:999px;font-weight:600;text-decoration:none;color:#ffffff">${escapeHtml(footer.buttonLabel)}</a></p>`
      : "",
    bookshelf ? `<p style="font-size:14px;line-height:1.6;margin:18px 0 0"><a href="${href(bookshelf)}" style="color:${b.muted};text-decoration:underline">Your bookshelf</a></p>` : "",
  ];
  return `<table role="presentation" data-personal-block width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${b.card};border:1px solid ${b.border};border-radius:12px">
<tr><td align="center" style="padding:28px 28px 30px;font-family:${b.body};color:${b.ink};text-align:center">${rows.join("")}</td></tr></table>`;
}

export type FooterNews = NonNullable<Footer["news"]>;

/** One quiet line under the block: "New from us:" and the title as the link. Empty when the link isn't http(s). */
export function renderNewsLine(news: FooterNews, track: (url: string) => string = (url) => url): string {
  const url = httpUrl(news.url);
  const title = news.title.trim();
  if (!url || !title) return "";
  const b = BRAND;
  return `<p data-news-line style="font-family:${b.body};font-size:14px;line-height:1.6;color:${b.muted};text-align:center;margin:16px 0 0">New from us: <a href="${escapeHtml(track(url))}" style="color:${b.link};text-decoration:underline">${escapeHtml(title)}</a></p>`;
}

/** The news line in the text/plain part. */
export function newsText(news: FooterNews): string {
  const url = httpUrl(news.url);
  const title = news.title.trim();
  return url && title ? `New from us: ${title} ${url}` : "";
}

function bareLink(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Same page, ignoring the query string, the fragment and a trailing slash. */
export function sameLink(a: string, b: string | null | undefined): boolean {
  if (!b) return false;
  const x = bareLink(a);
  return x !== null && x === bareLink(b);
}

/** The block in the text/plain part: the greeting, the headline and the button's link. */
export function footerText(footer: Footer): string {
  const button = httpUrl(footer.buttonUrl);
  return [footer.greeting.trim(), footer.headline, button ? `${footer.buttonLabel}: ${button}` : ""].filter(Boolean).join("\n");
}

export interface FooterConfig {
  url?: string;
  secret?: string;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The footers for one send batch, in the order of `emails`, in one request.
 * Null when the app's address or secret isn't set (send without a block). Any
 * failure (timeout, error status, bad shape) gives every reader the fallback:
 * a fault never stops or delays a send beyond the timeout.
 */
export async function fetchFooters(
  emails: string[],
  config: FooterConfig,
  options: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<Footer[] | null> {
  const url = config.url?.trim();
  const secret = config.secret?.trim();
  if (!url || !secret || !/^https:\/\//i.test(url)) return null;
  if (!emails.length) return [];
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, options.timeoutMs ?? 4000);
  });
  try {
    const answer = await Promise.race([
      (async () => {
        const response = await doFetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
          body: JSON.stringify({ emails }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<unknown>;
      })(),
      timeout,
    ]);
    const parsed = footersResponse.safeParse(answer);
    if (!parsed.success) throw new Error("bad shape");
    if (parsed.data.footers.length !== emails.length) throw new Error("wrong count");
    return parsed.data.footers;
  } catch (error) {
    // Counts and the reason only: never an address, a name or the secret.
    const reason = error instanceof Error ? (error.name === "AbortError" ? "timeout" : error.message) : "unknown";
    console.warn(`footers: using the fallback for ${emails.length} readers (${reason})`);
    return emails.map(() => FALLBACK_FOOTER);
  } finally {
    clearTimeout(timer);
  }
}

// Footer links aren't in the campaign body, so the click route can't check them
// against it. Each is signed for its delivery instead, so the route still
// redirects only to links Studio itself put in that email.

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
  return [...mac.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function signClick(key: string, deliveryId: string, url: string): Promise<string> {
  return hmacHex(key, `footer-click:v1\n${deliveryId}\n${url}`);
}

export async function verifyClick(key: string, deliveryId: string, url: string, sig: string): Promise<boolean> {
  if (!key || !sig) return false;
  const expected = await signClick(key, deliveryId, url);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
