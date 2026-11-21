import { env } from "cloudflare:workers";
import { GatewayRefusalError, integrationStatus, sendEmail } from "@every-app/sdk/server";
import { BRAND, emailLayout } from "@/lib/emailLayout";
import { escapeHtml, mergeTags, renderMarkdown, toPlainText } from "@/lib/markdown";
import { senderFor } from "@/lib/sender";
import type { Newsletter } from "./newsletters";

type Message = Parameters<typeof sendEmail>[0]["message"];

/**
 * The patterns the Gateway accepts as From for this app. In production they
 * come from the Gateway (the deployed Worker holds no copy); a failed lookup
 * falls back to the Gateway's sender and is retried on the next send.
 */
let senders: Promise<string[]> | null = null;
function allowedSenders(): Promise<string[]> {
  senders ??= integrationStatus({ env, provider: "email", for: { background: true } })
    .then((status) => ("senders" in status && Array.isArray(status.senders) ? status.senders : []))
    .catch(() => {
      senders = null;
      return [];
    });
  return senders;
}

export type SendResult = { ok: true } | { ok: false; code: string; message: string; retryLater: boolean };

const RETRY_LATER = new Set(["integration_not_configured", "email_budget_exhausted", "email_provider_limited", "app_monthly_cap_exceeded"]);

/** Sends one message; a Gateway refusal comes back as a result, never a throw. */
export async function deliver(
  newsletter: Pick<Newsletter, "fromName" | "slug" | "replyTo">,
  message: Omit<Message, "from" | "replyTo">,
  background: boolean,
): Promise<SendResult> {
  const from = senderFor(await allowedSenders(), newsletter);
  try {
    await sendEmail({
      env,
      ...(background ? { for: { background: true } } : {}),
      message: {
        ...message,
        ...(from ? { from } : {}),
        ...(newsletter.replyTo ? { replyTo: newsletter.replyTo } : {}),
      } as Message,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof GatewayRefusalError) {
      return { ok: false, code: error.code, message: error.message, retryLater: RETRY_LATER.has(error.code) };
    }
    throw error;
  }
}

function layout(title: string, inner: string, footer: string, preview = "", signoff = false): string {
  return emailLayout({ title, inner, footer, preview, signoff });
}

export interface IssueParts {
  newsletter: Pick<Newsletter, "name" | "slug" | "postalAddress">;
  campaign: { id: string; subject: string; previewText: string; body: string };
  contact: { firstName: string; token: string };
  deliveryId: string;
  origin: string;
  webUrl: string | null;
}

export function unsubscribeUrl(origin: string, slug: string, token: string, deliveryId?: string) {
  return `${origin}/n/${slug}/unsubscribe/${token}${deliveryId ? `?d=${deliveryId}` : ""}`;
}

/** One recipient's issue email: merge tags, tracked links, pixel, postal address and unsubscribe link. */
export function renderIssue(p: IssueParts) {
  const source = mergeTags(p.campaign.body, { first_name: p.contact.firstName });
  const track = (url: string) => `${p.origin}/t/c/${p.deliveryId}?u=${encodeURIComponent(url)}`;
  const unsubscribe = unsubscribeUrl(p.origin, p.newsletter.slug, p.contact.token, p.deliveryId);
  const footer = [
    p.webUrl ? `<a href="${escapeHtml(p.webUrl)}" style="color:inherit">Read online</a><br>` : "",
    escapeHtml(p.newsletter.postalAddress),
    `<br><a href="${escapeHtml(unsubscribe)}" style="color:inherit">Unsubscribe</a>`,
    `<img src="${p.origin}/t/o/${p.deliveryId}" width="1" height="1" alt="" style="display:block;border:0">`,
  ].join("");
  const subject = mergeTags(p.campaign.subject, { first_name: p.contact.firstName });
  return {
    subject,
    html: layout(p.newsletter.name, renderMarkdown(source, { email: true, link: track }), footer, mergeTags(p.campaign.previewText, { first_name: p.contact.firstName }), true),
    text: `${toPlainText(source)}\n\n--\n${p.newsletter.postalAddress}\nUnsubscribe: ${unsubscribe}\n`,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** A test copy to the sender: no tracking, merge tags at their fallbacks. */
export function renderTest(newsletter: Pick<Newsletter, "name" | "postalAddress">, campaign: { subject: string; previewText: string; body: string }) {
  const source = mergeTags(campaign.body, {});
  return {
    subject: `[Test] ${mergeTags(campaign.subject, {})}`,
    html: layout(newsletter.name, renderMarkdown(source, { email: true }), escapeHtml(newsletter.postalAddress), mergeTags(campaign.previewText, {}), true),
    text: toPlainText(source),
  };
}

export function renderConfirmation(newsletter: Pick<Newsletter, "name" | "postalAddress">, link: string) {
  const name = escapeHtml(newsletter.name);
  return {
    subject: `Confirm your subscription to ${newsletter.name}`,
    html: layout(
      newsletter.name,
      `<p style="font-size:16px;line-height:1.6">Confirm that you want to receive ${name}.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background-color:${BRAND.accent};border-radius:999px;font-weight:600;text-decoration:none;color:#ffffff">Confirm subscription</a></p>
<p style="font-size:14px;opacity:.7">If you didn't sign up, ignore this email.</p>`,
      escapeHtml(newsletter.postalAddress),
    ),
    text: `Confirm that you want to receive ${newsletter.name}:\n${link}\n\nIf you didn't sign up, ignore this email.`,
  };
}

export function renderWelcome(
  newsletter: Pick<Newsletter, "welcomeSubject" | "welcomeBody" | "postalAddress" | "slug" | "name">,
  contact: { firstName: string; token: string },
  origin: string,
) {
  const source = mergeTags(newsletter.welcomeBody, { first_name: contact.firstName });
  const unsubscribe = unsubscribeUrl(origin, newsletter.slug, contact.token);
  return {
    subject: mergeTags(newsletter.welcomeSubject || `Welcome to ${newsletter.name}`, { first_name: contact.firstName }),
    html: layout(
      newsletter.name,
      renderMarkdown(source, { email: true }),
      `${escapeHtml(newsletter.postalAddress)}<br><a href="${escapeHtml(unsubscribe)}" style="color:inherit">Unsubscribe</a>`,
    ),
    text: `${toPlainText(source)}\n\n--\n${newsletter.postalAddress}\nUnsubscribe: ${unsubscribe}\n`,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
