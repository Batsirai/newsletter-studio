import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, contacts, deliveries, linkClicks } from "@/db/schema";
import { NotFoundError, requireNewsletter } from "./newsletters";

export async function getOverview(userId: string, newsletterId: string) {
  const newsletter = await requireNewsletter(userId, newsletterId);
  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [[active], [total], signups, recent] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(contacts).where(and(eq(contacts.newsletterId, newsletterId), eq(contacts.status, "active"))),
    db.select({ n: sql<number>`count(*)` }).from(contacts).where(eq(contacts.newsletterId, newsletterId)),
    db
      .select({ day: sql<string>`substr(${contacts.createdAt}, 1, 10)`, n: sql<number>`count(*)` })
      .from(contacts)
      .where(and(eq(contacts.newsletterId, newsletterId), gte(contacts.createdAt, since)))
      .groupBy(sql`substr(${contacts.createdAt}, 1, 10)`),
    db
      .select({
        id: campaigns.id,
        subject: campaigns.subject,
        sentAt: campaigns.sentAt,
        destination: campaigns.destination,
        delivered: sql<number>`(select count(*) from deliveries d where d.campaign_id = campaigns.id and d.status = 'sent')`,
        opened: sql<number>`(select count(*) from deliveries d where d.campaign_id = campaigns.id and d.status = 'sent' and d.opened_at is not null)`,
        clicked: sql<number>`(select count(*) from deliveries d where d.campaign_id = campaigns.id and d.status = 'sent' and d.clicked_at is not null)`,
      })
      .from(campaigns)
      .where(and(eq(campaigns.newsletterId, newsletterId), eq(campaigns.status, "sent")))
      .orderBy(desc(campaigns.sentAt))
      .limit(5),
  ]);
  const byDay = new Map(signups.map((s) => [s.day, s.n]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return { day, signups: byDay.get(day) ?? 0 };
  });
  return {
    newsletter: { id: newsletter.id, name: newsletter.name, slug: newsletter.slug, websiteEnabled: newsletter.websiteEnabled },
    active: active?.n ?? 0,
    total: total?.n ?? 0,
    days,
    recent,
  };
}

export async function getReport(userId: string, newsletterId: string, campaignId: string) {
  await requireNewsletter(userId, newsletterId);
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.newsletterId, newsletterId)));
  if (!campaign) throw new NotFoundError("Campaign");
  const [[totals], links, people] = await Promise.all([
    db
      .select({
        recipients: sql<number>`count(*)`,
        delivered: sql<number>`sum(case when ${deliveries.status} = 'sent' then 1 else 0 end)`,
        opened: sql<number>`count(${deliveries.openedAt})`,
        clicked: sql<number>`count(${deliveries.clickedAt})`,
        unsubscribed: sql<number>`count(${deliveries.unsubscribedAt})`,
      })
      .from(deliveries)
      .where(eq(deliveries.campaignId, campaignId)),
    db
      .select({ url: linkClicks.url, clicks: sql<number>`count(*)`, people: sql<number>`count(distinct ${linkClicks.deliveryId})` })
      .from(linkClicks)
      .where(eq(linkClicks.campaignId, campaignId))
      .groupBy(linkClicks.url)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ contactId: contacts.id, email: contacts.email, openedAt: deliveries.openedAt, clickedAt: deliveries.clickedAt })
      .from(deliveries)
      .innerJoin(contacts, eq(contacts.id, deliveries.contactId))
      .where(and(eq(deliveries.campaignId, campaignId), sql`(${deliveries.openedAt} is not null or ${deliveries.clickedAt} is not null)`))
      .orderBy(contacts.email)
      .limit(1000),
  ]);
  return {
    campaign: {
      id: campaign.id,
      subject: campaign.subject,
      status: campaign.status,
      destination: campaign.destination,
      sentAt: campaign.sentAt,
      pageViews: campaign.pageViews,
    },
    totals: {
      recipients: totals?.recipients ?? 0,
      delivered: totals?.delivered ?? 0,
      opened: totals?.opened ?? 0,
      clicked: totals?.clicked ?? 0,
      unsubscribed: totals?.unsubscribed ?? 0,
    },
    links,
    people,
  };
}
