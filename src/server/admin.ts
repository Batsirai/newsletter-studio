import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, newsletters, users } from "@/db/schema";

/** Every newsletter and every campaign still sending, for workspace admins. */
export async function adminOverview() {
  const [list, sending] = await Promise.all([
    db
      .select({
        id: newsletters.id,
        name: newsletters.name,
        slug: newsletters.slug,
        owner: users.email,
        active: sql<number>`(select count(*) from contacts c where c.newsletter_id = newsletters.id and c.status = 'active')`,
      })
      .from(newsletters)
      .leftJoin(users, eq(users.id, newsletters.ownerId))
      .orderBy(desc(newsletters.createdAt)),
    db
      .select({ id: campaigns.id, subject: campaigns.subject, newsletter: newsletters.name })
      .from(campaigns)
      .innerJoin(newsletters, eq(newsletters.id, campaigns.newsletterId))
      .where(eq(campaigns.status, "sending")),
  ]);
  return { newsletters: list, sending };
}
