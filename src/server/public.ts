import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, contactEvents, contactTags, contacts, deliveries, linkClicks, newsletters } from "@/db/schema";
import { verifyClick } from "@/lib/footer";
import { linksIn } from "@/lib/markdown";
import { eventRow, MAX_TAGS, newToken, normalizeTags, STATUS_LABEL, type Status } from "./contacts";
import { deliver, renderConfirmation, renderWelcome } from "./mail";
import type { Newsletter } from "./newsletters";

export const signupInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().max(100).default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  source: z.enum(["website", "embed"]),
});

async function bySlug(slug: string): Promise<Newsletter | null> {
  const [row] = await db.select().from(newsletters).where(eq(newsletters.slug, slug));
  return row ?? null;
}

export async function publicNewsletter(slug: string) {
  const newsletter = await bySlug(slug);
  return newsletter?.websiteEnabled ? newsletter : null;
}

const published = (newsletterId: string) =>
  and(
    eq(campaigns.newsletterId, newsletterId),
    eq(campaigns.status, "sent"),
    inArray(campaigns.destination, ["both", "web"]),
    eq(campaigns.onWebsite, true),
  );

export async function siteIssues(newsletterId: string) {
  return db
    .select({ subject: campaigns.subject, slug: campaigns.slug, previewText: campaigns.previewText, sentAt: campaigns.sentAt })
    .from(campaigns)
    .where(published(newsletterId))
    .orderBy(desc(campaigns.sentAt));
}

/** Every web issue with its body, newest first, for the JSON and RSS feeds. */
export async function feedIssues(newsletterId: string) {
  return db
    .select({ subject: campaigns.subject, slug: campaigns.slug, previewText: campaigns.previewText, sentAt: campaigns.sentAt, body: campaigns.body })
    .from(campaigns)
    .where(published(newsletterId))
    .orderBy(desc(campaigns.sentAt));
}

export async function siteIssue(newsletterId: string, slug: string) {
  const [issue] = await db
    .select()
    .from(campaigns)
    .where(and(published(newsletterId), eq(campaigns.slug, slug)));
  if (!issue) return null;
  await db.update(campaigns).set({ pageViews: sql`${campaigns.pageViews} + 1` }).where(eq(campaigns.id, issue.id));
  return issue;
}


/** Subscribes or updates a contact. Returns the state the visitor ends in. */
export async function subscribe(slug: string, input: z.infer<typeof signupInput>, origin: string): Promise<"pending" | "active" | null> {
  const newsletter = await bySlug(slug);
  if (!newsletter) return null;
  const tags = normalizeTags(input.tags);
  const [existing] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.newsletterId, newsletter.id), eq(contacts.email, input.email)));

  const confirm = (token: string, email: string) =>
    deliver(newsletter, { to: email, ...renderConfirmation(newsletter, `${origin}/n/${newsletter.slug}/confirm/${token}`) }, true);
  const welcome = (contact: { email: string; firstName: string; token: string }) =>
    newsletter.welcomeEnabled
      ? deliver(newsletter, { to: contact.email, ...renderWelcome(newsletter, contact, origin) }, true)
      : Promise.resolve();

  if (existing) {
    const status = existing.status as Status;
    const next: Status = status === "unsubscribed" ? (newsletter.confirmOptIn ? "pending" : "active") : status;
    const firstName = existing.firstName || input.firstName;
    const have = await db.select({ tag: contactTags.tag }).from(contactTags).where(eq(contactTags.contactId, existing.id));
    const owned = new Set(have.map((t) => t.tag));
    const room = tags.filter((t) => !owned.has(t)).slice(0, Math.max(0, MAX_TAGS - owned.size));
    await db.batch([
      db.update(contacts).set({ firstName, status: next }).where(eq(contacts.id, existing.id)),
      ...room.map((tag) => db.insert(contactTags).values({ contactId: existing.id, newsletterId: newsletter.id, tag }).onConflictDoNothing()),
      ...(next !== status ? [db.insert(contactEvents).values(eventRow(existing.id, newsletter.id, "status", `${STATUS_LABEL[status]} → ${STATUS_LABEL[next]} (signed up again)`))] : []),
    ]);
    if (next === "pending") await confirm(existing.token, existing.email);
    else if (next === "active" && status === "unsubscribed") await welcome({ ...existing, firstName });
    return next === "pending" ? "pending" : "active";
  }

  const id = crypto.randomUUID();
  const token = newToken();
  const status: Status = newsletter.confirmOptIn ? "pending" : "active";
  await db.batch([
    db.insert(contacts).values({
      id,
      newsletterId: newsletter.id,
      email: input.email,
      firstName: input.firstName,
      status,
      source: input.source,
      token,
      confirmedAt: status === "active" ? new Date().toISOString() : null,
    }),
    db.insert(contactEvents).values(eventRow(id, newsletter.id, "signup", input.source === "embed" ? "Embedded form" : "Website")),
    ...tags.map((tag) => db.insert(contactTags).values({ contactId: id, newsletterId: newsletter.id, tag })),
  ]);
  if (status === "pending") await confirm(token, input.email);
  else await welcome({ email: input.email, firstName: input.firstName, token });
  return status;
}

async function byToken(slug: string, token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const [row] = await db
    .select({ contact: contacts, newsletter: newsletters })
    .from(contacts)
    .innerJoin(newsletters, eq(newsletters.id, contacts.newsletterId))
    .where(and(eq(contacts.token, token), eq(newsletters.slug, slug)));
  return row ?? null;
}

export async function confirmSubscription(slug: string, token: string, origin: string) {
  const found = await byToken(slug, token);
  if (!found) return null;
  const { contact, newsletter } = found;
  if (contact.status === "pending") {
    await db.batch([
      db.update(contacts).set({ status: "active", confirmedAt: new Date().toISOString() }).where(eq(contacts.id, contact.id)),
      db.insert(contactEvents).values(eventRow(contact.id, newsletter.id, "status", "Pending → Active (confirmed)")),
    ]);
    if (newsletter.welcomeEnabled) await deliver(newsletter, { to: contact.email, ...renderWelcome(newsletter, contact, origin) }, true);
  }
  return { newsletter, contact };
}

export async function unsubscribe(slug: string, token: string, deliveryId: string | null) {
  const found = await byToken(slug, token);
  if (!found) return null;
  const { contact, newsletter } = found;
  if (["active", "dormant", "pending"].includes(contact.status)) {
    const now = new Date().toISOString();
    await db.batch([
      db.update(contacts).set({ status: "unsubscribed" }).where(eq(contacts.id, contact.id)),
      db.insert(contactEvents).values(eventRow(contact.id, newsletter.id, "status", `${STATUS_LABEL[contact.status as Status]} → Unsubscribed`)),
      ...(deliveryId
        ? [db.update(deliveries).set({ unsubscribedAt: now }).where(and(eq(deliveries.id, deliveryId), eq(deliveries.contactId, contact.id), isNull(deliveries.unsubscribedAt)))]
        : []),
    ]);
  }
  return { newsletter, contact };
}

export async function resubscribe(slug: string, token: string) {
  const found = await byToken(slug, token);
  if (!found) return null;
  const { contact, newsletter } = found;
  if (contact.status === "unsubscribed") {
    await db.batch([
      db.update(contacts).set({ status: "active" }).where(eq(contacts.id, contact.id)),
      db.insert(contactEvents).values(eventRow(contact.id, newsletter.id, "status", "Unsubscribed → Active (resubscribed)")),
    ]);
  }
  return { newsletter, contact };
}

async function deliveryFor(id: string) {
  if (!/^[a-z0-9]{32}$/.test(id)) return null;
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id));
  return row ?? null;
}

async function newsletterOf(contactId: string) {
  const [row] = await db.select({ newsletterId: contacts.newsletterId }).from(contacts).where(eq(contacts.id, contactId));
  return row?.newsletterId ?? null;
}

export async function trackOpen(id: string) {
  const delivery = await deliveryFor(id);
  if (!delivery || delivery.openedAt) return;
  const updated = await db
    .update(deliveries)
    .set({ openedAt: new Date().toISOString() })
    .where(and(eq(deliveries.id, id), isNull(deliveries.openedAt)))
    .returning({ id: deliveries.id });
  const nid = await newsletterOf(delivery.contactId);
  if (updated.length && nid) {
    const [c] = await db.select({ subject: campaigns.subject }).from(campaigns).where(eq(campaigns.id, delivery.campaignId));
    await db.insert(contactEvents).values(eventRow(delivery.contactId, nid, "opened", c?.subject ?? ""));
  }
}

/**
 * The URL to redirect to, only when the campaign contains it, or when it is a
 * personal-block link Studio signed for this delivery (`sig`, keyed by the footer secret).
 */
export async function trackClick(id: string, url: string, sig = ""): Promise<string | null> {
  const delivery = await deliveryFor(id);
  if (!delivery) return null;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, delivery.campaignId));
  if (!campaign || !/^(https?:|mailto:)/i.test(url)) return null;
  const allowed = linksIn(campaign.body).includes(url) || (/^https?:/i.test(url) && (await verifyClick(env.FOOTER_API_SECRET ?? "", id, url, sig)));
  if (!allowed) return null;
  const now = new Date().toISOString();
  const nid = await newsletterOf(delivery.contactId);
  await db.batch([
    db.insert(linkClicks).values({ id: crypto.randomUUID(), deliveryId: id, campaignId: campaign.id, url }),
    db.update(deliveries).set({ clickedAt: now }).where(and(eq(deliveries.id, id), isNull(deliveries.clickedAt))),
    ...(nid ? [db.insert(contactEvents).values(eventRow(delivery.contactId, nid, "clicked", url))] : []),
  ]);
  return url;
}
