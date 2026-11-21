// The issue email for one reader, and the test copy for the sender. Pure, so
// tests can render it without the Worker; src/server/mail.ts sends it.

import { emailLayout } from "./emailLayout";
import { footerText, newsText, renderFooterBlock, renderNewsLine, sameLink, signClick, type Footer } from "./footer";
import { escapeHtml, mergeTags, renderMarkdown, toPlainText } from "./markdown";

export interface IssueParts {
  newsletter: { name: string; slug: string; postalAddress: string };
  campaign: { id: string; subject: string; previewText: string; body: string };
  contact: { firstName: string; token: string };
  deliveryId: string;
  origin: string;
  webUrl: string | null;
  /** The reader's personal block, and the key its tracked links are signed with. None: no block. */
  footer?: { block: Footer; key: string } | null;
}

export function unsubscribeUrl(origin: string, slug: string, token: string, deliveryId?: string) {
  return `${origin}/n/${slug}/unsubscribe/${token}${deliveryId ? `?d=${deliveryId}` : ""}`;
}

/** One recipient's issue email: merge tags, tracked links, pixel, personal block, postal address and unsubscribe link. */
export async function renderIssue(p: IssueParts) {
  const source = mergeTags(p.campaign.body, { first_name: p.contact.firstName });
  const track = (url: string) => `${p.origin}/t/c/${p.deliveryId}?u=${encodeURIComponent(url)}`;
  const unsubscribe = unsubscribeUrl(p.origin, p.newsletter.slug, p.contact.token, p.deliveryId);
  const footer = [
    p.webUrl ? `<a href="${escapeHtml(p.webUrl)}" style="color:inherit">Read online</a><br>` : "",
    escapeHtml(p.newsletter.postalAddress),
    `<br><a href="${escapeHtml(unsubscribe)}" style="color:inherit">Unsubscribe</a>`,
    `<img src="${p.origin}/t/o/${p.deliveryId}" width="1" height="1" alt="" style="display:block;border:0">`,
  ].join("");
  let block = "";
  let blockText = "";
  if (p.footer) {
    const { block: data, key } = p.footer;
    // The "New from us" line, unless it is this very issue.
    const news = data.news && !sameLink(data.news.url, p.webUrl) ? data.news : null;
    const signed = new Map<string, string>();
    const links = [data.buttonUrl.trim(), data.bookshelfUrl.trim(), ...(news ? [news.url.trim()] : [])];
    for (const url of new Set(links)) {
      signed.set(url, `${track(url)}&s=${await signClick(key, p.deliveryId, url)}`);
    }
    const tracked = (url: string) => signed.get(url) ?? track(url);
    block = renderFooterBlock(data, tracked) + (news ? renderNewsLine(news, tracked) : "");
    const newsLine = news ? newsText(news) : "";
    blockText = `${footerText(data)}\n${newsLine ? `\n${newsLine}\n` : ""}\n`;
  }
  const subject = mergeTags(p.campaign.subject, { first_name: p.contact.firstName });
  return {
    subject,
    html: emailLayout({
      title: p.newsletter.name,
      inner: renderMarkdown(source, { email: true, link: track }),
      footer,
      preview: mergeTags(p.campaign.previewText, { first_name: p.contact.firstName }),
      block,
    }),
    text: `${toPlainText(source)}\n\n${blockText}--\n${p.newsletter.postalAddress}\nUnsubscribe: ${unsubscribe}\n`,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** A test copy to the sender: no tracking, merge tags at their fallbacks, and a sample block when one is chosen. */
export function renderTest(
  newsletter: { name: string; postalAddress: string },
  campaign: { subject: string; previewText: string; body: string },
  sample?: Footer,
) {
  const source = mergeTags(campaign.body, {});
  return {
    subject: `[Test] ${mergeTags(campaign.subject, {})}`,
    html: emailLayout({
      title: newsletter.name,
      inner: renderMarkdown(source, { email: true }),
      footer: escapeHtml(newsletter.postalAddress),
      preview: mergeTags(campaign.previewText, {}),
      block: sample ? renderFooterBlock(sample) : "",
    }),
    text: sample ? `${toPlainText(source)}\n\n${footerText(sample)}` : toPlainText(source),
  };
}
