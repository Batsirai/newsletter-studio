import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as q from "@/server/campaigns";
import { listSegments } from "@/server/segments";
import { getReport } from "@/server/stats";
import { orNull, requestOrigin } from "@/server/request";
import { userMiddleware } from "./middleware";

export const listCampaigns = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => z.object({ newsletterId: z.string() }).parse(d))
  .handler(({ data, context }) => orNull(() => q.listCampaigns(context.user.id, data.newsletterId)));

export const getCampaign = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) =>
    orNull(async () => {
      const [detail, segments] = await Promise.all([
        q.getCampaign(context.user.id, data.newsletterId, data.campaignId),
        listSegments(context.user.id, data.newsletterId),
      ]);
      return { ...detail, segments: segments.segments.map((s) => ({ id: s.id, name: s.name, reach: s.reach })), me: context.user.email };
    }),
  );

export const getCampaignReport = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => orNull(() => getReport(context.user.id, data.newsletterId, data.campaignId)));

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => z.object({ newsletterId: z.string() }).parse(d))
  .handler(({ data, context }) => q.createCampaign(context.user.id, data.newsletterId));

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.saveCampaignInput.parse(d))
  .handler(({ data, context }) => q.saveCampaign(context.user.id, data));

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.deleteCampaign(context.user.id, data));

export const sendTest = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.sendTest(context.user.id, context.user.email, data));

export const sendNow = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.sendNow(context.user.id, requestOrigin(), data));

export const scheduleCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.scheduleInput.parse(d))
  .handler(({ data, context }) => q.scheduleCampaign(context.user.id, requestOrigin(), data));

export const cancelSchedule = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.cancelSchedule(context.user.id, data));

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.pauseCampaign(context.user.id, data));

export const resumeCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.parse(d))
  .handler(({ data, context }) => q.resumeCampaign(context.user.id, data));

export const setIssueOnWebsite = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.campaignRef.extend({ onWebsite: z.boolean() }).parse(d))
  .handler(({ data, context }) => q.setOnWebsite(context.user.id, data));
