import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, segments } from "@/db/schema";
import { nextDay, selectContacts, SOURCES } from "./contacts";
import { NotFoundError, requireNewsletter } from "./newsletters";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const rulesSchema = z.object({
  tagsAny: z.array(z.string().trim().min(1).max(50)).max(20),
  tagsAll: z.array(z.string().trim().min(1).max(50)).max(20),
  source: z.enum(SOURCES).nullable(),
  after: date.nullable(),
  before: date.nullable(),
});
export type Rules = z.infer<typeof rulesSchema>;

export const saveSegmentInput = z.object({
  newsletterId: z.string(),
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(50),
  rules: rulesSchema,
});
export const segmentRef = z.object({ newsletterId: z.string(), segmentId: z.string() });

/** Contacts of a newsletter matching a segment's rules. */
export function rulesWhere(newsletterId: string, rules: Rules): SQL {
  const parts: SQL[] = [eq(contacts.newsletterId, newsletterId)];
  if (rules.tagsAny.length)
    parts.push(sql`exists (select 1 from contact_tags t where t.contact_id = contacts.id and t.tag in ${rules.tagsAny})`);
  for (const tag of rules.tagsAll)
    parts.push(sql`exists (select 1 from contact_tags t where t.contact_id = contacts.id and t.tag = ${tag})`);
  if (rules.source) parts.push(eq(contacts.source, rules.source));
  if (rules.after) parts.push(gte(contacts.createdAt, nextDay(rules.after)));
  if (rules.before) parts.push(lt(contacts.createdAt, rules.before));
  return and(...parts)!;
}

export function audienceWhere(newsletterId: string, rules: Rules | null): SQL {
  const base = rules ? rulesWhere(newsletterId, rules) : eq(contacts.newsletterId, newsletterId);
  return and(base, eq(contacts.status, "active"))!;
}

export async function countAudience(newsletterId: string, rules: Rules | null): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(contacts).where(audienceWhere(newsletterId, rules));
  return row?.n ?? 0;
}

export async function findSegment(newsletterId: string, segmentId: string) {
  const [row] = await db.select().from(segments).where(and(eq(segments.id, segmentId), eq(segments.newsletterId, newsletterId)));
  return row ? { ...row, rules: rulesSchema.parse(JSON.parse(row.rules)) } : null;
}

export async function listSegments(userId: string, newsletterId: string) {
  await requireNewsletter(userId, newsletterId);
  const rows = await db.select().from(segments).where(eq(segments.newsletterId, newsletterId)).orderBy(segments.name);
  const totalActive = await countAudience(newsletterId, null);
  const list = await Promise.all(
    rows.map(async (s) => {
      const rules = rulesSchema.parse(JSON.parse(s.rules));
      return { id: s.id, name: s.name, rules, reach: await countAudience(newsletterId, rules) };
    }),
  );
  return { segments: list, totalActive };
}

export async function getSegment(userId: string, newsletterId: string, segmentId: string) {
  await requireNewsletter(userId, newsletterId);
  const segment = await findSegment(newsletterId, segmentId);
  if (!segment) throw new NotFoundError("Segment");
  const [contactsList, totalActive] = await Promise.all([
    selectContacts(audienceWhere(newsletterId, segment.rules), 500),
    countAudience(newsletterId, null),
  ]);
  return { id: segment.id, name: segment.name, rules: segment.rules, contacts: contactsList, totalActive };
}

export async function saveSegment(userId: string, input: z.infer<typeof saveSegmentInput>) {
  await requireNewsletter(userId, input.newsletterId);
  const rules = JSON.stringify(input.rules);
  if (input.id) {
    const updated = await db
      .update(segments)
      .set({ name: input.name, rules })
      .where(and(eq(segments.id, input.id), eq(segments.newsletterId, input.newsletterId)))
      .returning({ id: segments.id });
    if (!updated.length) throw new NotFoundError("Segment");
    return { id: input.id };
  }
  const id = crypto.randomUUID();
  await db.insert(segments).values({ id, newsletterId: input.newsletterId, name: input.name, rules });
  return { id };
}

/** Drafts that used the segment keep its id, so their review asks for a new choice. */
export async function deleteSegment(userId: string, input: z.infer<typeof segmentRef>) {
  await requireNewsletter(userId, input.newsletterId);
  await db.delete(segments).where(and(eq(segments.id, input.segmentId), eq(segments.newsletterId, input.newsletterId)));
  return { id: input.segmentId };
}
