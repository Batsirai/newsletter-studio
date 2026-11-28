import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { processCampaign, runDue } from "@/server/campaigns";
import { tools } from "@/tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401). The queue sends issues in
// batches; the minute cron starts scheduled campaigns.
export default {
  ...everyApp<Env>(async (request) => tanstackEntry.fetch(request), { tools }),
  async queue(batch: MessageBatch<{ campaignId: string }>) {
    for (const message of batch.messages) {
      await processCampaign(message.body.campaignId);
      message.ack();
    }
  },
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runDue());
  },
};
