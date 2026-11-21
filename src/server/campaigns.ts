import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, contactEvents, contacts, deliveries, newsletters } from "@/db/schema";
import { slugify } from "@/lib/markdown";
import { reviewCampaign } from "@/lib/review";
import { isValidTimeZone, QUARTER_HOURS, zonedTimeToUtc } from "@/lib/schedule";
import { eventRow } from "./contacts";
import { deliver, renderIssue, renderTest } from "./mail";
import { NotFoundError, requireNewsletter, type Newsletter } from "./newsletters";
import { audienceWhere, countAudience, findSegment } from "./segments";

export type Campaign = typeof campaigns.$inferSelect;
export const DESTINATIONS = ["both", "email", "web"] as const;

export const campaignRef = z.object({ newsletterId: z.string(), campaignId: z.string() });
export const saveCampaignInput = campaignRef.extend({
  subject: z.string().max(300),
  previewText: z.string().max(300),
  body: z.string().max(200_000),
  destination: z.enum(DESTINATIONS),
  segmentId: z.string().nullable(),
});
export const scheduleInput = campaignRef.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().refine((t) => QUARTER_HOURS.includes(t), "Pick a time"),
  timeZone: z.string().refine(isValidTimeZone, "Pick a time zone"),
});

const BATCH = 25;

interface SendsQueue {
  send(message: { campaignId: string }): Promise<void>;
}
function sendsQueue(): SendsQueue {
  return (env as unknown as { SENDS: SendsQueue }).SENDS;
}

async function requireCampaign(userId: string, newsletterId: string, campaignId: string) {
  const newsletter = await requireNewsletter(userId, newsletterId);
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.newsletterId, newsletterId)));
  if (!campaign) throw new NotFoundError("Campaign");
  return { newsletter, campaign };
}

async function review(newsletter: Newsletter, campaign: Campaign) {
  const segment = campaign.segmentId ? await findSegment(newsletter.id, campaign.segmentId) : null;
  const items = reviewCampaign({
    subject: campaign.subject,
    previewText: campaign.previewText,
    body: campaign.body,
    fromName: newsletter.fromName,
    postalAddress: newsletter.postalAddress,
    segmentMissing: Boolean(campaign.segmentId && !segment),
    testSent: Boolean(campaign.testSentAt),
    destination: campaign.destination,
  });
  return { items, segment };
}

export async function listCampaigns(userId: string, newsletterId: string) {
  await requireNewsletter(userId, newsletterId);
  return db
    .select({
      id: campaigns.id,
      subject: campaigns.subject,
      status: campaigns.status,
      destination: campaigns.destination,
      scheduledAt: campaigns.scheduledAt,
      sentAt: campaigns.sentAt,
      createdAt: campaigns.createdAt,
      recipients: sql<number>`(select count(*) from deliveries d where d.campaign_id = campaigns.id)`,
    })
    .from(campaigns)
    .where(eq(campaigns.newsletterId, newsletterId))
    .orderBy(desc(campaigns.createdAt));
}

export async function createCampaign(userId: string, newsletterId: string) {
  await requireNewsletter(userId, newsletterId);
  const id = crypto.randomUUID();
  await db.insert(campaigns).values({ id, newsletterId });
  return { id };
}

export async function getCampaign(userId: string, newsletterId: string, campaignId: string) {
  const { newsletter, campaign } = await requireCampaign(userId, newsletterId, campaignId);
  const { items, segment } = await review(newsletter, campaign);
  const [recipients, totalActive, progress] = await Promise.all([
    countAudience(newsletterId, segment?.rules ?? null),
    countAudience(newsletterId, null),
    db
      .select({ status: deliveries.status, n: sql<number>`count(*)` })
      .from(deliveries)
      .where(eq(deliveries.campaignId, campaignId))
      .groupBy(deliveries.status),
  ]);
  return {
    campaign,
    newsletter: { id: newsletter.id, name: newsletter.name, slug: newsletter.slug, websiteEnabled: newsletter.websiteEnabled, fromName: newsletter.fromName, postalAddress: newsletter.postalAddress },
    review: items,
    recipients: campaign.segmentId && !segment ? 0 : recipients,
    totalActive,
    progress: Object.fromEntries(progress.map((p) => [p.status, p.n])) as Record<string, number>,
  };
}

export async function saveCampaign(userId: string, input: z.infer<typeof saveCampaignInput>) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  if (campaign.status !== "draft") throw new Error("Only drafts can be edited");
  if (input.segmentId && !(await findSegment(input.newsletterId, input.segmentId))) throw new NotFoundError("Segment");
  const { newsletterId, campaignId, ...change } = input;
  await db.update(campaigns).set(change).where(and(eq(campaigns.id, campaignId), eq(campaigns.newsletterId, newsletterId)));
  return { id: campaignId };
}

export async function deleteCampaign(userId: string, input: z.infer<typeof campaignRef>) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  if (campaign.status !== "draft") throw new Error("Only drafts can be deleted");
  await db.delete(campaigns).where(and(eq(campaigns.id, campaign.id), eq(campaigns.newsletterId, input.newsletterId)));
  return { id: campaign.id };
}

export async function sendTest(userId: string, email: string, input: z.infer<typeof campaignRef>) {
  const { newsletter, campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  if (!campaign.subject.trim() || !campaign.body.trim()) throw new Error("Add a subject and content first");
  const result = await deliver(newsletter, { to: email, ...renderTest(newsletter, campaign) }, false);
  if (!result.ok) throw new Error(`The test wasn't sent: ${result.message}`);
  await db.update(campaigns).set({ testSentAt: new Date().toISOString() }).where(eq(campaigns.id, campaign.id));
  return { to: email };
}

async function assertReady(newsletter: Newsletter, campaign: Campaign) {
  if (campaign.status !== "draft") throw new Error("Only drafts can be sent");
  const { items } = await review(newsletter, campaign);
  const blocking = items.filter((i) => i.level === "blocking");
  if (blocking.length) throw new Error(blocking.map((i) => i.message).join(" "));
}

async function uniqueIssueSlug(newsletterId: string, subject: string): Promise<string> {
  const base = slugify(subject);
  const taken = await db
    .select({ slug: campaigns.slug })
    .from(campaigns)
    .where(and(eq(campaigns.newsletterId, newsletterId), sql`(${campaigns.slug} = ${base} or ${campaigns.slug} like ${base + "-%"})`));
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Starts a send: web-only issues are published at once, email goes to the queue. */
async function startSend(campaign: Campaign) {
  const now = new Date().toISOString();
  const slug = await uniqueIssueSlug(campaign.newsletterId, campaign.subject);
  if (campaign.destination === "web") {
    await db.update(campaigns).set({ status: "sent", sentAt: now, slug }).where(eq(campaigns.id, campaign.id));
    return;
  }
  const segment = campaign.segmentId ? await findSegment(campaign.newsletterId, campaign.segmentId) : null;
  const where = audienceWhere(campaign.newsletterId, segment?.rules ?? null);
  await db.run(sql`insert or ignore into deliveries (id, campaign_id, contact_id, status)
    select lower(hex(randomblob(16))), ${campaign.id}, ${contacts.id}, 'queued' from ${contacts} where ${where}`);
  await db.update(campaigns).set({ status: "sending", sentAt: now, slug, note: null }).where(eq(campaigns.id, campaign.id));
  await sendsQueue().send({ campaignId: campaign.id });
}

export async function sendNow(userId: string, origin: string, input: z.infer<typeof campaignRef>) {
  const { newsletter, campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  await assertReady(newsletter, campaign);
  const claimed = await db
    .update(campaigns)
    .set({ status: "sending", origin })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "draft")))
    .returning({ id: campaigns.id });
  if (!claimed.length) throw new Error("Only drafts can be sent");
  await startSend({ ...campaign, origin });
  return { id: campaign.id };
}

export async function scheduleCampaign(userId: string, origin: string, input: z.infer<typeof scheduleInput>) {
  const { newsletter, campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  await assertReady(newsletter, campaign);
  const at = zonedTimeToUtc(input.date, input.time, input.timeZone);
  if (at.getTime() <= Date.now()) throw new Error("Pick a time in the future");
  await db
    .update(campaigns)
    .set({ status: "scheduled", scheduledAt: at.toISOString(), timeZone: input.timeZone, origin })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "draft")));
  return { scheduledAt: at.toISOString() };
}

export async function cancelSchedule(userId: string, input: z.infer<typeof campaignRef>) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  await db
    .update(campaigns)
    .set({ status: "draft", scheduledAt: null })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "scheduled")));
  return { id: campaign.id };
}

export async function pauseById(campaignId: string) {
  await db
    .update(campaigns)
    .set({ status: "paused" })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")));
}

export async function pauseCampaign(userId: string, input: z.infer<typeof campaignRef>) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  await pauseById(campaign.id);
  return { id: campaign.id };
}

export async function resumeCampaign(userId: string, input: z.infer<typeof campaignRef>) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  const resumed = await db
    .update(campaigns)
    .set({ status: "sending", note: null })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "paused")))
    .returning({ id: campaigns.id });
  if (resumed.length) await sendsQueue().send({ campaignId: campaign.id });
  return { id: campaign.id };
}

export async function setOnWebsite(userId: string, input: z.infer<typeof campaignRef> & { onWebsite: boolean }) {
  const { campaign } = await requireCampaign(userId, input.newsletterId, input.campaignId);
  await db.update(campaigns).set({ onWebsite: input.onWebsite }).where(eq(campaigns.id, campaign.id));
  return { id: campaign.id };
}

/** Queue consumer: sends the next batch of a campaign, then queues the rest. */
export async function processCampaign(campaignId: string): Promise<void> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign || campaign.status !== "sending") return;
  const [newsletter] = await db.select().from(newsletters).where(eq(newsletters.id, campaign.newsletterId));
  if (!newsletter) return;
  const origin = campaign.origin ?? "";

  const claimed = await db
    .update(deliveries)
    .set({ status: "sending" })
    .where(
      and(
        eq(deliveries.status, "queued"),
        inArray(
          deliveries.id,
          db.select({ id: deliveries.id }).from(deliveries).where(and(eq(deliveries.campaignId, campaignId), eq(deliveries.status, "queued"))).limit(BATCH),
        ),
      ),
    )
    .returning({ id: deliveries.id, contactId: deliveries.contactId });

  const webUrl =
    campaign.destination === "both" && newsletter.websiteEnabled && campaign.slug ? `${origin}/n/${newsletter.slug}/p/${campaign.slug}` : null;

  for (const delivery of claimed) {
    const [current] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, delivery.contactId));
    if (current?.status !== "sending") {
      await db.update(deliveries).set({ status: "queued" }).where(eq(deliveries.id, delivery.id));
      continue;
    }
    // Only active contacts are emailed; bounced, complained and the rest are skipped.
    if (!contact || contact.status !== "active") {
      await db.update(deliveries).set({ status: "failed", error: "skipped" }).where(eq(deliveries.id, delivery.id));
      continue;
    }
    const email = renderIssue({ newsletter, campaign, contact, deliveryId: delivery.id, origin, webUrl });
    const result = await deliver(newsletter, { to: contact.email, ...email }, true);
    if (result.ok) {
      await db.batch([
        db.update(deliveries).set({ status: "sent", sentAt: new Date().toISOString() }).where(eq(deliveries.id, delivery.id)),
        db.insert(contactEvents).values(eventRow(contact.id, newsletter.id, "received", campaign.subject)),
      ]);
    } else if (result.retryLater) {
      await db.batch([
        db.update(deliveries).set({ status: "queued" }).where(eq(deliveries.id, delivery.id)),
        db.update(campaigns).set({ status: "paused", note: result.message }).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending"))),
      ]);
      return;
    } else {
      await db.update(deliveries).set({ status: "failed", error: result.code }).where(eq(deliveries.id, delivery.id));
    }
  }

  const [left] = await db
    .select({ n: sql<number>`count(*)` })
    .from(deliveries)
    .where(and(eq(deliveries.campaignId, campaignId), inArray(deliveries.status, ["queued", "sending"])));
  if (!left?.n) {
    await db.update(campaigns).set({ status: "sent" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")));
  } else if (claimed.length) {
    await sendsQueue().send({ campaignId });
  }
}

/** Cron: start scheduled campaigns that are due, and nudge sends whose queue message was lost. */
export async function runDue(): Promise<void> {
  const now = new Date().toISOString();
  const due = await db
    .update(campaigns)
    .set({ status: "sending" })
    .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, now)))
    .returning();
  for (const campaign of due) await startSend(campaign);
  const sending = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, "sending"));
  for (const c of sending) {
    if (!due.some((d) => d.id === c.id)) await sendsQueue().send({ campaignId: c.id });
  }
}
