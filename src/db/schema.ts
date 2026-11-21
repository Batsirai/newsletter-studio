import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

// The Gateway's people, keyed by user.id, created on first sight.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  orgId: text("org_id"),
  createdAt: createdAt(),
});

export const newsletters = sqliteTable(
  "newsletters",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    fromName: text("from_name").notNull().default(""),
    replyTo: text("reply_to").notNull().default(""),
    postalAddress: text("postal_address").notNull().default(""),
    confirmOptIn: integer("confirm_opt_in", { mode: "boolean" })
      .notNull()
      .default(false),
    welcomeEnabled: integer("welcome_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    welcomeSubject: text("welcome_subject").notNull().default(""),
    welcomeBody: text("welcome_body").notNull().default(""),
    websiteEnabled: integer("website_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("newsletters_slug").on(t.slug),
    index("newsletters_owner").on(t.ownerId),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    newsletterId: text("newsletter_id").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull().default(""),
    // active | pending | dormant | unsubscribed | bounced | complained
    status: text("status").notNull(),
    // website | embed | manual
    source: text("source").notNull(),
    // { [name]: { type: "text" | "number" | "date", value: string } }
    fields: text("fields").notNull().default("{}"),
    token: text("token").notNull(),
    createdAt: createdAt(),
    confirmedAt: text("confirmed_at"),
  },
  (t) => [
    uniqueIndex("contacts_newsletter_email").on(t.newsletterId, t.email),
    uniqueIndex("contacts_token").on(t.token),
    index("contacts_newsletter_status").on(t.newsletterId, t.status),
  ],
);

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id").notNull(),
    newsletterId: text("newsletter_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tag] }),
    index("contact_tags_newsletter_tag").on(t.newsletterId, t.tag),
  ],
);

export const contactEvents = sqliteTable(
  "contact_events",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    newsletterId: text("newsletter_id").notNull(),
    // signup | confirmed | status | received | opened | clicked
    type: text("type").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("contact_events_contact").on(t.contactId)],
);

export const segments = sqliteTable(
  "segments",
  {
    id: text("id").primaryKey(),
    newsletterId: text("newsletter_id").notNull(),
    name: text("name").notNull(),
    // { tagsAny: string[], tagsAll: string[], source: string | null, after: string | null, before: string | null }
    rules: text("rules").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("segments_newsletter").on(t.newsletterId)],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    newsletterId: text("newsletter_id").notNull(),
    subject: text("subject").notNull().default(""),
    previewText: text("preview_text").notNull().default(""),
    body: text("body").notNull().default(""),
    slug: text("slug"),
    // both | email | web
    destination: text("destination").notNull().default("both"),
    segmentId: text("segment_id"),
    // draft | scheduled | sending | paused | sent
    status: text("status").notNull().default("draft"),
    scheduledAt: text("scheduled_at"),
    timeZone: text("time_zone"),
    sentAt: text("sent_at"),
    testSentAt: text("test_sent_at"),
    origin: text("origin"),
    onWebsite: integer("on_website", { mode: "boolean" })
      .notNull()
      .default(true),
    pageViews: integer("page_views").notNull().default(0),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("campaigns_newsletter").on(t.newsletterId)],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    contactId: text("contact_id").notNull(),
    // queued | sending | sent | failed
    status: text("status").notNull().default("queued"),
    error: text("error"),
    sentAt: text("sent_at"),
    openedAt: text("opened_at"),
    clickedAt: text("clicked_at"),
    unsubscribedAt: text("unsubscribed_at"),
  },
  (t) => [
    uniqueIndex("deliveries_campaign_contact").on(t.campaignId, t.contactId),
    index("deliveries_contact").on(t.contactId),
  ],
);

export const linkClicks = sqliteTable(
  "link_clicks",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("link_clicks_campaign").on(t.campaignId)],
);
