import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  campaigns,
  contactEvents,
  contactTags,
  contacts,
  deliveries,
  linkClicks,
  newsletters,
  segments,
} from "@/db/schema";

export type Newsletter = typeof newsletters.$inferSelect;

export class NotFoundError extends Error {
  constructor(what = "Newsletter") {
    super(`${what} not found`);
  }
}

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use at least 2 characters")
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const createNewsletterInput = z
  .object({ name: z.string().trim().min(1, "Name is required").max(100), slug })
  .strict();

export const updateNewsletterInput = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1, "Name is required").max(100),
    slug,
    description: z.string().trim().max(500),
    fromName: z.string().trim().max(100),
    replyTo: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    postalAddress: z.string().trim().max(300),
    confirmOptIn: z.boolean(),
    welcomeEnabled: z.boolean(),
    welcomeSubject: z.string().trim().max(200),
    welcomeBody: z.string().max(20000),
    websiteEnabled: z.boolean(),
  })
  .strict();

/** The newsletter if this user owns it, else null. Every child query starts here. */
export async function getOwnedNewsletter(userId: string, id: string): Promise<Newsletter | null> {
  const [row] = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.id, id), eq(newsletters.ownerId, userId)));
  return row ?? null;
}

export async function requireNewsletter(userId: string, id: string): Promise<Newsletter> {
  const row = await getOwnedNewsletter(userId, id);
  if (!row) throw new NotFoundError();
  return row;
}

export async function listNewsletters(userId: string) {
  return db
    .select({
      id: newsletters.id,
      name: newsletters.name,
      slug: newsletters.slug,
      websiteEnabled: newsletters.websiteEnabled,
      active: sql<number>`(select count(*) from contacts c where c.newsletter_id = newsletters.id and c.status = 'active')`,
    })
    .from(newsletters)
    .where(eq(newsletters.ownerId, userId))
    .orderBy(desc(newsletters.createdAt));
}

async function slugTaken(value: string, exceptId?: string): Promise<boolean> {
  const [row] = await db.select({ id: newsletters.id }).from(newsletters).where(eq(newsletters.slug, value));
  return Boolean(row && row.id !== exceptId);
}

export async function createNewsletter(
  user: { id: string; orgId?: string },
  input: z.infer<typeof createNewsletterInput>,
): Promise<{ id: string }> {
  if (await slugTaken(input.slug)) throw new Error("That URL slug is taken");
  const id = crypto.randomUUID();
  await db.insert(newsletters).values({
    id,
    ownerId: user.id,
    orgId: user.orgId ?? null,
    name: input.name,
    slug: input.slug,
    fromName: input.name,
  });
  return { id };
}

export async function updateNewsletter(userId: string, { id, ...input }: z.infer<typeof updateNewsletterInput>) {
  await requireNewsletter(userId, id);
  if (await slugTaken(input.slug, id)) throw new Error("That URL slug is taken");
  await db.update(newsletters).set(input).where(and(eq(newsletters.id, id), eq(newsletters.ownerId, userId)));
  return { id };
}

/** Removes the newsletter and everything under it, in one batch. */
export async function deleteNewsletter(userId: string, id: string) {
  await requireNewsletter(userId, id);
  const campaignIds = db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.newsletterId, id));
  await db.batch([
    db.delete(linkClicks).where(sql`${linkClicks.campaignId} in ${campaignIds}`),
    db.delete(deliveries).where(sql`${deliveries.campaignId} in ${campaignIds}`),
    db.delete(campaigns).where(eq(campaigns.newsletterId, id)),
    db.delete(segments).where(eq(segments.newsletterId, id)),
    db.delete(contactEvents).where(eq(contactEvents.newsletterId, id)),
    db.delete(contactTags).where(eq(contactTags.newsletterId, id)),
    db.delete(contacts).where(eq(contacts.newsletterId, id)),
    db.delete(newsletters).where(and(eq(newsletters.id, id), eq(newsletters.ownerId, userId))),
  ]);
  return { id };
}
