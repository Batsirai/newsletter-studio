import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  contacts,
  contactEvents,
  newsletters,
  signupClaims,
} from "@/db/schema";
import { eventRow, newToken } from "./contacts";
import { requireNewsletter } from "./newsletters";

export const CONSENT_VERSION = "al-tonight-newsletter-v1";
const DAY = 86400000;
function controlledEmail(email: string) {
  const [local, domain] = email.toLowerCase().split("@");
  return (
    ["example.com", "example.org", "example.net"].includes(domain) ||
    /\.(test|invalid|example)$/.test(domain) ||
    /\+(test|qa|e2e|igtest)\b/.test(local)
  );
}
const suppressed = new Set(["unsubscribed", "bounced", "complained"]);
export const signupClaimInput = z
  .object({
    newsletterId: z.string().min(1).max(100),
    claimKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
    email: z.string().trim().toLowerCase().email().max(254),
    source: z.literal("instagram_tonight"),
    variant: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    testTraffic: z.boolean(),
    consentVersion: z.literal(CONSENT_VERSION),
    consentedAt: z.number().int().nonnegative(),
  })
  .strict();
export const signupReceiptInput = signupClaimInput
  .pick({ newsletterId: true, claimKey: true })
  .strict();
export type SignupConfig = { newsletterId: string; origin: string };
type Claim = typeof signupClaims.$inferSelect;

export function signupConfig(env: Record<string, unknown>): SignupConfig {
  const newsletterId = String(env.SIGNUP_NEWSLETTER_ID ?? "");
  const raw = String(env.SIGNUP_PUBLIC_ORIGIN ?? "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Signup integration needs setup");
  }
  if (
    !newsletterId ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Signup integration needs setup");
  return { newsletterId, origin: url.origin };
}
async function authorized(
  userId: string,
  newsletterId: string,
  config: SignupConfig,
) {
  if (newsletterId !== config.newsletterId)
    throw new Error("Newsletter not found");
  const newsletter = await requireNewsletter(userId, newsletterId);
  if (!newsletter.confirmOptIn || !newsletter.websiteEnabled)
    throw new Error(
      "Signup integration requires confirmation and a public newsletter site",
    );
  return newsletter;
}
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function tokenFor(
  contactToken: string,
  claim: Pick<Claim, "newsletterId" | "claimKey">,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(contactToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        JSON.stringify(["signup-v1", claim.newsletterId, claim.claimKey]),
      ),
    ),
  );
}
async function tokenHash(token: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
}
async function findClaim(newsletterId: string, claimKey: string) {
  const [claim] = await db
    .select()
    .from(signupClaims)
    .where(
      and(
        eq(signupClaims.newsletterId, newsletterId),
        eq(signupClaims.claimKey, claimKey),
      ),
    );
  return claim ?? null;
}
async function contactFor(claim: Claim) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.newsletterId, claim.newsletterId),
        eq(contacts.id, claim.contactId),
      ),
    );
  return contact ?? null;
}
async function receipt(claim: Claim) {
  const contact = await contactFor(claim);
  const status = !contact
    ? "unknown"
    : suppressed.has(contact.status)
      ? "suppressed"
      : contact.status === "pending"
        ? "pending"
        : contact.status === "active"
          ? "active"
          : "existing";
  return {
    claimKey: claim.claimKey,
    publicationId: claim.newsletterId,
    source: claim.source,
    variant: claim.variant,
    consentVersion: claim.consentVersion,
    consentedAt: claim.consentedAt,
    confirmedAt: claim.confirmedAt,
    createdAt: claim.createdAt,
    status,
    baseline: claim.baseline,
    newActive: Boolean(
      claim.baseline === "absent" &&
        claim.firstRecipient &&
        claim.confirmedAt &&
        contact?.confirmedAt === claim.confirmedAt &&
        status === "active" &&
        !claim.testTraffic,
    ),
    testTraffic: claim.testTraffic,
  };
}
async function claimResult(claim: Claim, config: SignupConfig, slug: string) {
  const result = await receipt(claim);
  const contact = await contactFor(claim);
  if (claim.confirmedAt && result.status === "pending")
    return { ...result, status: "existing", newActive: false };
  if (
    claim.baseline === "absent" &&
    result.status === "pending" &&
    Date.parse(claim.expiresAt) <= Date.now()
  )
    return { ...result, status: "expired" };
  if (claim.baseline !== "absent" || result.status !== "pending" || !contact)
    return result;
  const token = await tokenFor(contact.token, claim);
  if ((await tokenHash(token)) !== claim.confirmHash)
    return { ...result, status: "unknown", newActive: false };
  return {
    ...result,
    confirmationUrl: `${config.origin}/n/${encodeURIComponent(slug)}/join/${token}`,
  };
}

/** Authenticated tool only. No mail call; a pending receipt is never active. */
export async function claimSignup(
  userId: string,
  input: z.infer<typeof signupClaimInput>,
  config: SignupConfig,
) {
  const newsletter = await authorized(userId, input.newsletterId, config);
  const old = await findClaim(input.newsletterId, input.claimKey);
  if (old) {
    const contact = await contactFor(old);
    if (
      !contact ||
      contact.email !== input.email ||
      old.source !== input.source ||
      old.variant !== input.variant ||
      old.testTraffic !== (input.testTraffic || controlledEmail(input.email)) ||
      old.consentedAt !== new Date(input.consentedAt).toISOString()
    )
      throw new Error("Signup claim does not match its original request");
    return claimResult(old, config, newsletter.slug);
  }
  const now = Date.now();
  if (input.consentedAt > now || now - input.consentedAt > DAY)
    throw new Error("A fresh explicit newsletter choice is required");
  const [existing] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.newsletterId, input.newsletterId),
        eq(contacts.email, input.email),
      ),
    );
  const recipientHash = await tokenHash(
    JSON.stringify([input.newsletterId, input.email]),
  );
  const [historical] = await db
    .select()
    .from(signupClaims)
    .where(
      and(
        eq(signupClaims.newsletterId, input.newsletterId),
        eq(signupClaims.recipientHash, recipientHash),
      ),
    )
    .limit(1);
  const contactId =
    existing?.id ?? historical?.contactId ?? crypto.randomUUID();
  const contactToken = existing?.token ?? newToken();
  const createdAt = new Date(now).toISOString();
  const claim: Claim = {
    id: crypto.randomUUID(),
    newsletterId: input.newsletterId,
    claimKey: input.claimKey,
    recipientHash,
    firstRecipient: !historical,
    contactId,
    baseline: existing || historical ? "existing" : "absent",
    source: input.source,
    variant: input.variant,
    testTraffic: input.testTraffic || controlledEmail(input.email),
    consentVersion: input.consentVersion,
    consentedAt: new Date(input.consentedAt).toISOString(),
    confirmHash: null,
    confirmedAt: null,
    expiresAt: new Date(now + 3 * DAY).toISOString(),
    createdAt,
  };
  if (!existing && !historical)
    claim.confirmHash = await tokenHash(await tokenFor(contactToken, claim));
  try {
    if (existing || historical) await db.insert(signupClaims).values(claim);
    else
      await db.batch([
        db.insert(contacts).values({
          id: contactId,
          newsletterId: input.newsletterId,
          email: input.email,
          firstName: "",
          status: "pending",
          source: "embed",
          token: contactToken,
          createdAt,
        }),
        db.insert(signupClaims).values(claim),
        db
          .insert(contactEvents)
          .values(
            eventRow(
              contactId,
              input.newsletterId,
              "signup",
              "Authenticated signup; confirmation pending",
            ),
          ),
      ]);
  } catch {
    // A competing request can win either unique key. Reconcile once; never
    // retry a send (this function has no sender). Other failures stay visible.
    const prior = await findClaim(input.newsletterId, input.claimKey);
    if (prior) return claimSignup(userId, input, config);
    const [winner] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.newsletterId, input.newsletterId),
          eq(contacts.email, input.email),
        ),
      );
    const [reservation] = await db
      .select()
      .from(signupClaims)
      .where(
        and(
          eq(signupClaims.newsletterId, input.newsletterId),
          eq(signupClaims.recipientHash, recipientHash),
          eq(signupClaims.firstRecipient, true),
        ),
      )
      .limit(1);
    if (winner || reservation) {
      await db.insert(signupClaims).values({
        ...claim,
        contactId: winner?.id ?? reservation.contactId,
        firstRecipient: false,
        baseline: "existing",
        confirmHash: null,
      });
      return claimResult(
        (await findClaim(input.newsletterId, input.claimKey))!,
        config,
        newsletter.slug,
      );
    }
    throw new Error("Signup storage unavailable");
  }
  return claimResult(claim, config, newsletter.slug);
}
export async function signupReceipt(
  userId: string,
  input: z.infer<typeof signupReceiptInput>,
  config: SignupConfig,
) {
  await authorized(userId, input.newsletterId, config);
  const claim = await findClaim(input.newsletterId, input.claimKey);
  return claim
    ? receipt(claim)
    : { claimKey: input.claimKey, status: "unknown", newActive: false };
}

/** Token lookup is read-only: a GET or mail scanner must never activate. */
export async function confirmationView(
  slug: string,
  token: string,
  config: SignupConfig,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [newsletter] = await db
    .select()
    .from(newsletters)
    .where(
      and(eq(newsletters.id, config.newsletterId), eq(newsletters.slug, slug)),
    );
  if (!newsletter?.websiteEnabled || !newsletter.confirmOptIn) return null;
  const [claim] = await db
    .select()
    .from(signupClaims)
    .where(
      and(
        eq(signupClaims.newsletterId, newsletter.id),
        eq(signupClaims.confirmHash, await tokenHash(token)),
      ),
    );
  if (!claim || claim.baseline !== "absent") return null;
  const result = await receipt(claim);
  return {
    name: newsletter.name,
    status:
      Date.parse(claim.expiresAt) <= Date.now()
        ? "expired"
        : claim.confirmedAt && result.status === "pending"
          ? "existing"
          : result.status,
    claimId: claim.id,
  };
}
export async function confirmSignup(
  slug: string,
  token: string,
  config: SignupConfig,
) {
  const view = await confirmationView(slug, token, config);
  if (!view || view.status !== "pending") return view;
  const [claim] = await db
    .select()
    .from(signupClaims)
    .where(
      and(
        eq(signupClaims.id, view.claimId),
        eq(signupClaims.newsletterId, config.newsletterId),
      ),
    );
  if (!claim || claim.confirmedAt) return view;
  const now = new Date().toISOString();
  // Conditional statements in one batch: a concurrent unsubscribe/suppression
  // must not be overwritten and cannot yield a confirmed acquisition.
  await db.batch([
    db
      .update(contacts)
      .set({ status: "active", confirmedAt: now })
      .where(
        and(
          eq(contacts.id, claim.contactId),
          eq(contacts.newsletterId, claim.newsletterId),
          eq(contacts.status, "pending"),
          // Recheck consumption/expiry at the write, not just the earlier view.
          sql`exists (select 1 from signup_claims where id = ${claim.id} and newsletter_id = ${claim.newsletterId} and contact_id = ${claim.contactId} and confirmed_at is null and expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        ),
      ),
    db
      .update(signupClaims)
      .set({ confirmedAt: now })
      .where(
        and(
          eq(signupClaims.id, claim.id),
          eq(signupClaims.newsletterId, claim.newsletterId),
          isNull(signupClaims.confirmedAt),
          // The preceding conditional UPDATE must have changed this row in
          // this batch. Equal timestamps are not transition ownership proof.
          sql`changes() = 1`,
        ),
      ),
    db
      .insert(contactEvents)
      .select(
        db
          .select({
            id: sql<string>`${`signup-confirm-${claim.id}`}`.as("id"),
            contactId: sql<string>`${claim.contactId}`.as("contactId"),
            newsletterId: sql<string>`${claim.newsletterId}`.as("newsletterId"),
            type: sql<string>`'confirmed'`.as("type"),
            detail: sql<string>`'Confirmed through explicit signup choice'`.as(
              "detail",
            ),
            createdAt: sql<string>`${now}`.as("createdAt"),
          })
          .from(signupClaims)
          .where(
            and(
              eq(signupClaims.id, claim.id),
              eq(signupClaims.confirmedAt, now),
            ),
          ),
      )
      .onConflictDoNothing(),
  ]);
  return confirmationView(slug, token, config);
}
