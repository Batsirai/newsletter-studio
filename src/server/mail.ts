import { env } from "cloudflare:workers";
import { GatewayRefusalError, sendEmail } from "@every-app/sdk/server";
import { BRAND, emailLayout } from "@/lib/emailLayout";
import { unsubscribeUrl } from "@/lib/issueEmail";
import { escapeHtml, mergeTags, renderMarkdown, toPlainText } from "@/lib/markdown";
import type { Newsletter } from "./newsletters";

export { renderIssue, renderTest } from "@/lib/issueEmail";

type Message = Parameters<typeof sendEmail>[0]["message"];

/**
 * The newsletter's own sender when the install allows one: one exact
 * address, or `<slug>@domain` under a `*@domain` pattern. Otherwise the
 * Gateway's sender.
 */
function fromFor(newsletter: Pick<Newsletter, "fromName" | "slug">): Message["from"] | undefined {
  const patterns = String((env as unknown as Record<string, unknown>).EVERYAPP_EMAIL_SENDERS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const first = patterns[0];
  if (!first || !newsletter.fromName) return undefined;
  const address = first.startsWith("*@") ? `${newsletter.slug}@${first.slice(2)}` : first;
  return { address, name: newsletter.fromName };
}

export type SendResult = { ok: true } | { ok: false; code: string; message: string; retryLater: boolean };

const RETRY_LATER = new Set(["integration_not_configured", "email_budget_exhausted", "email_provider_limited", "app_monthly_cap_exceeded"]);

/** Sends one message; a Gateway refusal comes back as a result, never a throw. */
export async function deliver(
  newsletter: Pick<Newsletter, "fromName" | "slug" | "replyTo">,
  message: Omit<Message, "from" | "replyTo">,
  background: boolean,
): Promise<SendResult> {
  const from = fromFor(newsletter);
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

function layout(title: string, inner: string, footer: string, preview = ""): string {
  return emailLayout({ title, inner, footer, preview });
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
