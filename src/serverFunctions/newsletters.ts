import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as q from "@/server/newsletters";
import { getOverview } from "@/server/stats";
import { orNull, requestOrigin } from "@/server/request";
import { userMiddleware } from "./middleware";

const idInput = z.object({ id: z.string() });

export const listNewsletters = createServerFn()
  .middleware([userMiddleware])
  .handler(({ context }) => q.listNewsletters(context.user.id));

export const getNewsletter = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = await q.getOwnedNewsletter(context.user.id, data.id);
    return row ? { newsletter: row, origin: requestOrigin() } : null;
  });

export const getNewsletterOverview = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => orNull(() => getOverview(context.user.id, data.id)));

export const createNewsletter = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.createNewsletterInput.parse(d))
  .handler(({ data, context }) => q.createNewsletter(context.user, data));

export const updateNewsletter = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.updateNewsletterInput.parse(d))
  .handler(({ data, context }) => q.updateNewsletter(context.user.id, data));

export const deleteNewsletter = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => idInput.parse(d))
  .handler(({ data, context }) => q.deleteNewsletter(context.user.id, data.id));
