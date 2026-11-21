import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { z } from "zod";
import { adminOverview } from "@/server/admin";
import { pauseById } from "@/server/campaigns";
import { userMiddleware } from "./middleware";

export const getAdminOverview = createServerFn()
  .middleware([userMiddleware])
  .handler(async ({ context }) => (isAdmin(context.user) ? { allowed: true as const, ...(await adminOverview()) } : { allowed: false as const }));

export const adminPauseCampaign = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => z.object({ campaignId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isAdmin(context.user)) throw new Error("Only workspace admins can pause another member's send");
    await pauseById(data.campaignId);
    return { id: data.campaignId };
  });
