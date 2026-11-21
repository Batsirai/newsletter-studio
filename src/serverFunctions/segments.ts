import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as q from "@/server/segments";
import { orNull } from "@/server/request";
import { userMiddleware } from "./middleware";

export const listSegments = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => z.object({ newsletterId: z.string() }).parse(d))
  .handler(({ data, context }) => orNull(() => q.listSegments(context.user.id, data.newsletterId)));

export const getSegment = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => q.segmentRef.parse(d))
  .handler(({ data, context }) => orNull(() => q.getSegment(context.user.id, data.newsletterId, data.segmentId)));

export const saveSegment = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.saveSegmentInput.parse(d))
  .handler(({ data, context }) => q.saveSegment(context.user.id, data));

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.segmentRef.parse(d))
  .handler(({ data, context }) => q.deleteSegment(context.user.id, data));
