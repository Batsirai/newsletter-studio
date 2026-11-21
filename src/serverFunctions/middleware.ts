import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { ensureUser } from "@/server/users";

/** The signed-in member, with their app record made on first sight. */
export const userMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => {
    await ensureUser(context.user);
    return next();
  });
