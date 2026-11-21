import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { parsePostsJson } from "@/lib/posts";
import { requireNewsletter } from "./newsletters";

export const MAX_POSTS = 1000;

export const importPostsInput = z.object({
  newsletterId: z.string(),
  json: z.string().max(10_000_000),
});

/**
 * Adds past posts as sent web issues, so they show on the newsletter's site
 * and feed. Nothing is emailed. A post whose slug is already used here is left
 * as it is.
 */
export async function importPosts(
  userId: string,
  input: z.infer<typeof importPostsInput>,
) {
  await requireNewsletter(userId, input.newsletterId);
  const parsed = parsePostsJson(input.json);
  if (parsed.rows.length > MAX_POSTS)
    throw new Error(`At most ${MAX_POSTS} posts in one file`);
  const have = new Set(
    (
      await db
        .select({ slug: campaigns.slug })
        .from(campaigns)
        .where(and(eq(campaigns.newsletterId, input.newsletterId)))
    ).map((r) => r.slug),
  );
  const fresh = parsed.rows.filter((p) => !have.has(p.slug));
  for (let i = 0; i < fresh.length; i += 20) {
    const statements = fresh.slice(i, i + 20).map((p) =>
      db.insert(campaigns).values({
        id: crypto.randomUUID(),
        newsletterId: input.newsletterId,
        subject: p.subject,
        previewText: p.previewText,
        body: p.body,
        slug: p.slug,
        destination: "web",
        status: "sent",
        sentAt: p.sentAt,
        onWebsite: true,
        note: "Imported",
      }),
    );
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
  }
  return {
    added: fresh.length,
    existing: parsed.rows.length - fresh.length,
    invalid: parsed.invalid,
    repeated: parsed.repeated,
  };
}
