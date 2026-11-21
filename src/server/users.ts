import { db } from "@/db";
import { users } from "@/db/schema";

interface Identity {
  id: string;
  email: string;
  orgId?: string;
}

/** The app's own record of a Gateway user, made on first sight. */
export async function ensureUser(user: Identity): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, orgId: user.orgId ?? null })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, orgId: user.orgId ?? null },
    });
}
