import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contactEvents, contactTags, contacts, deliveries, segments } from "@/db/schema";
import { requireNewsletter, NotFoundError } from "./newsletters";

export const STATUSES = ["active", "pending", "dormant", "unsubscribed", "bounced", "complained"] as const;
export const SOURCES = ["website", "embed", "manual"] as const;
export type Status = (typeof STATUSES)[number];
export const MAX_TAGS = 50;
export const MAX_FIELDS = 20;
export const PAGE_SIZE = 50;

const tag = z.string().trim().min(1).max(50);
const tagList = z.array(tag).max(MAX_TAGS, `At most ${MAX_TAGS} tags`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const contactFilter = z.object({
  newsletterId: z.string(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(STATUSES).optional(),
  source: z.enum(SOURCES).optional(),
  tag: tag.optional(),
  from: date.optional(),
  to: date.optional(),
  page: z.number().int().min(1).optional(),
});
export type ContactFilter = z.infer<typeof contactFilter>;

const fieldValue = z.object({ type: z.enum(["text", "number", "date"]), value: z.string().max(500) });
export const fieldsSchema = z
  .record(z.string().trim().min(1).max(50), fieldValue)
  .refine((f) => Object.keys(f).length <= MAX_FIELDS, `At most ${MAX_FIELDS} fields`)
  .refine(
    (f) =>
      Object.values(f).every(
        (v) =>
          v.value === "" ||
          (v.type === "number" ? !Number.isNaN(Number(v.value)) : v.type === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(v.value) : true),
      ),
    "A number or date field has a value of the wrong kind",
  );
export type Fields = z.infer<typeof fieldsSchema>;

export const addContactInput = z.object({
  newsletterId: z.string(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  firstName: z.string().trim().max(100).default(""),
  tags: tagList.default([]),
});

export const updateContactInput = z.object({
  newsletterId: z.string(),
  contactId: z.string(),
  firstName: z.string().trim().max(100),
  fields: fieldsSchema,
  tags: tagList,
});

export const setStatusInput = z.object({
  newsletterId: z.string(),
  contactId: z.string(),
  status: z.enum(STATUSES),
});

export const contactRef = z.object({ newsletterId: z.string(), contactId: z.string() });

export const bulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addTag"), newsletterId: z.string(), ids: z.array(z.string()).min(1).max(PAGE_SIZE), tag }),
  z.object({ action: z.literal("removeTag"), newsletterId: z.string(), ids: z.array(z.string()).min(1).max(PAGE_SIZE), tag }),
  z.object({ action: z.literal("status"), newsletterId: z.string(), ids: z.array(z.string()).min(1).max(PAGE_SIZE), status: z.enum(STATUSES) }),
  z.object({ action: z.literal("delete"), newsletterId: z.string(), ids: z.array(z.string()).min(1).max(PAGE_SIZE), confirm: z.number() }),
  z.object({ action: z.literal("segment"), newsletterId: z.string(), ids: z.array(z.string()).min(1).max(PAGE_SIZE), name: z.string().trim().min(1).max(50) }),
]);

/** Which statuses a contact may move to the given one from. */
export function allowedFrom(to: Status): Status[] {
  switch (to) {
    case "active":
      return ["dormant", "unsubscribed", "pending"];
    case "dormant":
      return ["active"];
    case "unsubscribed":
      return ["active", "dormant", "pending"];
    case "bounced":
      return ["active", "dormant", "pending", "unsubscribed", "complained"];
    case "complained":
      return ["active", "dormant", "pending", "unsubscribed", "bounced"];
    case "pending":
      return [];
  }
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TAGS);
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function eventRow(contactId: string, newsletterId: string, type: string, detail = "") {
  return { id: crypto.randomUUID(), contactId, newsletterId, type, detail };
}

export const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  pending: "Pending",
  dormant: "Dormant",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
};

function filterWhere(f: ContactFilter): SQL {
  const parts: SQL[] = [eq(contacts.newsletterId, f.newsletterId)];
  if (f.q) {
    const pattern = f.q.includes("*") ? f.q.toLowerCase().replaceAll("*", "%") : `%${f.q.toLowerCase()}%`;
    parts.push(sql`${contacts.email} like ${pattern}`);
  }
  if (f.status) parts.push(eq(contacts.status, f.status));
  if (f.source) parts.push(eq(contacts.source, f.source));
  if (f.tag) parts.push(sql`exists (select 1 from contact_tags t where t.contact_id = contacts.id and t.tag = ${f.tag})`);
  if (f.from) parts.push(gte(contacts.createdAt, f.from));
  if (f.to) parts.push(lt(contacts.createdAt, nextDay(f.to)));
  return and(...parts)!;
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const listed = {
  id: contacts.id,
  email: contacts.email,
  firstName: contacts.firstName,
  status: contacts.status,
  source: contacts.source,
  createdAt: contacts.createdAt,
  tags: sql<string | null>`(select group_concat(tag, char(31)) from contact_tags t where t.contact_id = contacts.id)`,
};

function splitTags(value: string | null): string[] {
  return value ? value.split("\u001f").sort() : [];
}

export async function selectContacts(where: SQL, limit?: number, offset = 0) {
  const query = db.select(listed).from(contacts).where(where).orderBy(desc(contacts.createdAt), contacts.id);
  const rows = await (limit ? query.limit(limit).offset(offset) : query);
  return rows.map((r) => ({ ...r, tags: splitTags(r.tags) }));
}

export async function listContacts(userId: string, f: ContactFilter) {
  await requireNewsletter(userId, f.newsletterId);
  const page = f.page ?? 1;
  const where = filterWhere(f);
  const [rows, [count], tags] = await Promise.all([
    selectContacts(where, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)` }).from(contacts).where(where),
    db.selectDistinct({ tag: contactTags.tag }).from(contactTags).where(eq(contactTags.newsletterId, f.newsletterId)).orderBy(contactTags.tag),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize: PAGE_SIZE, allTags: tags.map((t) => t.tag) };
}

export async function exportContactsCsv(userId: string, f: ContactFilter): Promise<string> {
  await requireNewsletter(userId, f.newsletterId);
  const rows = await db
    .select({ ...listed, fields: contacts.fields })
    .from(contacts)
    .where(filterWhere(f))
    .orderBy(desc(contacts.createdAt));
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : v);
  const lines = [["email", "first_name", "status", "source", "signed_up", "tags", "fields"].join(",")];
  for (const r of rows) {
    const fields = Object.entries(JSON.parse(r.fields) as Fields).map(([k, v]) => `${k}=${v.value}`).join("; ");
    lines.push([r.email, r.firstName, r.status, r.source, r.createdAt, splitTags(r.tags).join("; "), fields].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export async function addContact(userId: string, input: z.infer<typeof addContactInput>) {
  await requireNewsletter(userId, input.newsletterId);
  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.newsletterId, input.newsletterId), eq(contacts.email, input.email)));
  if (existing) throw new Error("That email is already a contact");
  const id = crypto.randomUUID();
  const tags = normalizeTags(input.tags);
  await db.batch([
    db.insert(contacts).values({
      id,
      newsletterId: input.newsletterId,
      email: input.email,
      firstName: input.firstName,
      status: "active",
      source: "manual",
      token: newToken(),
    }),
    db.insert(contactEvents).values(eventRow(id, input.newsletterId, "signup", "Added by hand")),
    ...tags.map((t) => db.insert(contactTags).values({ contactId: id, newsletterId: input.newsletterId, tag: t })),
  ]);
  return { id };
}

async function requireContact(userId: string, newsletterId: string, contactId: string) {
  await requireNewsletter(userId, newsletterId);
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.newsletterId, newsletterId)));
  if (!row) throw new NotFoundError("Contact");
  return row;
}

export async function getContact(userId: string, newsletterId: string, contactId: string) {
  const row = await requireContact(userId, newsletterId, contactId);
  const [tags, events, [rates]] = await Promise.all([
    db.select({ tag: contactTags.tag }).from(contactTags).where(eq(contactTags.contactId, contactId)).orderBy(contactTags.tag),
    db.select().from(contactEvents).where(eq(contactEvents.contactId, contactId)).orderBy(desc(contactEvents.createdAt)).limit(200),
    db
      .select({
        sent: sql<number>`count(*)`,
        opened: sql<number>`count(${deliveries.openedAt})`,
        clicked: sql<number>`count(${deliveries.clickedAt})`,
      })
      .from(deliveries)
      .where(and(eq(deliveries.contactId, contactId), eq(deliveries.status, "sent"))),
  ]);
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    status: row.status as Status,
    source: row.source,
    createdAt: row.createdAt,
    fields: JSON.parse(row.fields) as Fields,
    tags: tags.map((t) => t.tag),
    events: events.map((e) => ({ id: e.id, type: e.type, detail: e.detail, createdAt: e.createdAt })),
    rates: { sent: rates?.sent ?? 0, opened: rates?.opened ?? 0, clicked: rates?.clicked ?? 0 },
  };
}

export async function updateContact(userId: string, input: z.infer<typeof updateContactInput>) {
  await requireContact(userId, input.newsletterId, input.contactId);
  const tags = normalizeTags(input.tags);
  await db.batch([
    db
      .update(contacts)
      .set({ firstName: input.firstName, fields: JSON.stringify(input.fields) })
      .where(and(eq(contacts.id, input.contactId), eq(contacts.newsletterId, input.newsletterId))),
    db.delete(contactTags).where(eq(contactTags.contactId, input.contactId)),
    ...tags.map((t) => db.insert(contactTags).values({ contactId: input.contactId, newsletterId: input.newsletterId, tag: t })),
  ]);
  return { id: input.contactId };
}

export async function setStatus(userId: string, input: z.infer<typeof setStatusInput>) {
  const row = await requireContact(userId, input.newsletterId, input.contactId);
  if (!allowedFrom(input.status).includes(row.status as Status)) {
    throw new Error(`A ${row.status} contact can't become ${input.status}`);
  }
  await db.batch([
    db
      .update(contacts)
      .set({ status: input.status })
      .where(and(eq(contacts.id, row.id), eq(contacts.newsletterId, input.newsletterId))),
    db
      .insert(contactEvents)
      .values(eventRow(row.id, input.newsletterId, "status", `${STATUS_LABEL[row.status as Status]} → ${STATUS_LABEL[input.status]}`)),
  ]);
  return { id: row.id, status: input.status };
}

export async function deleteContact(userId: string, input: z.infer<typeof contactRef>) {
  const row = await requireContact(userId, input.newsletterId, input.contactId);
  await db.batch([
    db.delete(contactTags).where(eq(contactTags.contactId, row.id)),
    db.delete(contactEvents).where(eq(contactEvents.contactId, row.id)),
    db.delete(contacts).where(and(eq(contacts.id, row.id), eq(contacts.newsletterId, input.newsletterId))),
  ]);
  return { id: row.id };
}

export async function bulk(userId: string, input: z.infer<typeof bulkInput>) {
  await requireNewsletter(userId, input.newsletterId);
  const nid = input.newsletterId;
  const owned = await db
    .select({ id: contacts.id, status: contacts.status })
    .from(contacts)
    .where(and(eq(contacts.newsletterId, nid), inArray(contacts.id, input.ids)));
  const ids = owned.map((c) => c.id);
  if (!ids.length) return { changed: 0 };

  const addTag = async (value: string) => {
    await db.run(sql`insert or ignore into contact_tags (contact_id, newsletter_id, tag)
      select id, newsletter_id, ${value} from contacts
      where newsletter_id = ${nid} and id in ${ids}
      and (select count(*) from contact_tags t where t.contact_id = contacts.id) < ${MAX_TAGS}`);
  };

  switch (input.action) {
    case "addTag":
      await addTag(input.tag.trim());
      return { changed: ids.length };
    case "removeTag":
      await db.delete(contactTags).where(and(eq(contactTags.newsletterId, nid), inArray(contactTags.contactId, ids), eq(contactTags.tag, input.tag.trim())));
      return { changed: ids.length };
    case "status": {
      const movable = owned.filter((c) => allowedFrom(input.status).includes(c.status as Status));
      if (!movable.length) return { changed: 0 };
      await db.batch([
        db.update(contacts).set({ status: input.status }).where(and(eq(contacts.newsletterId, nid), inArray(contacts.id, movable.map((c) => c.id)))),
        ...movable.map((c) =>
          db.insert(contactEvents).values(eventRow(c.id, nid, "status", `${STATUS_LABEL[c.status as Status]} → ${STATUS_LABEL[input.status]}`)),
        ),
      ]);
      return { changed: movable.length };
    }
    case "delete":
      if (input.confirm !== ids.length) throw new Error(`Type ${ids.length} to confirm`);
      await db.batch([
        db.delete(contactTags).where(and(eq(contactTags.newsletterId, nid), inArray(contactTags.contactId, ids))),
        db.delete(contactEvents).where(and(eq(contactEvents.newsletterId, nid), inArray(contactEvents.contactId, ids))),
        db.delete(contacts).where(and(eq(contacts.newsletterId, nid), inArray(contacts.id, ids))),
      ]);
      return { changed: ids.length };
    case "segment": {
      await addTag(input.name);
      await db.insert(segments).values({
        id: crypto.randomUUID(),
        newsletterId: nid,
        name: input.name,
        rules: JSON.stringify({ tagsAny: [input.name], tagsAll: [], source: null, after: null, before: null }),
      });
      return { changed: ids.length };
    }
  }
}
