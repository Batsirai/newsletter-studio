import { createFileRoute, Link } from "@tanstack/react-router";
import { NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Stat } from "@/client/components/Stat";
import { CampaignStatus, formatDate, percent } from "@/client/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { getCampaignReport } from "@/serverFunctions/campaigns";

export const Route = createFileRoute("/newsletters/$id/campaigns/$campaignId/report")({
  loader: ({ params }) => getCampaignReport({ data: { newsletterId: params.id, campaignId: params.campaignId } }),
  component: Report,
});

function Report() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  const { campaign, totals } = data;
  const emailed = campaign.destination !== "web";
  return (
    <NewsletterFrame id={id} found>
      <PageHeader
        backLink={
          <Link to="/newsletters/$id/campaigns/$campaignId" params={{ id, campaignId: campaign.id }} className="text-sm text-muted-foreground hover:text-foreground">
            Campaign
          </Link>
        }
        title={campaign.subject}
        description={
          <span className="flex items-center gap-2">
            <CampaignStatus status={campaign.status} />
            {campaign.sentAt ? <span>{formatDate(campaign.sentAt, true)}</span> : null}
          </span>
        }
      />
      {emailed ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat label="Recipients" value={totals.recipients} testId="stat-recipients" />
          <Stat label="Delivered" value={totals.delivered} testId="stat-delivered" />
          <Stat label="Unique opens" value={totals.opened} sub={percent(totals.opened, totals.delivered)} testId="stat-opens" />
          <Stat label="Unique clicks" value={totals.clicked} sub={percent(totals.clicked, totals.delivered)} testId="stat-clicks" />
          <Stat label="Unsubscribes" value={totals.unsubscribed} sub={percent(totals.unsubscribed, totals.delivered)} testId="stat-unsubscribes" />
          {campaign.destination === "both" ? <Stat label="Page views" value={campaign.pageViews} /> : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat label="Page views" value={campaign.pageViews} testId="stat-views" />
        </div>
      )}
      {emailed ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Clicks per link</h2>
            {data.links.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Link</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.links.map((l) => (
                    <TableRow key={l.url} data-testid="link-row">
                      <TableCell className="max-w-80 truncate">{l.url}</TableCell>
                      <TableCell className="text-right">{l.people}</TableCell>
                      <TableCell className="text-right">{l.clicks}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No clicks yet.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Who opened and clicked</h2>
            {data.people.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Clicked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.people.map((p) => (
                    <TableRow key={p.contactId} data-testid="who-row">
                      <TableCell>
                        <Link to="/newsletters/$id/contacts/$contactId" params={{ id, contactId: p.contactId }} className="hover:underline">
                          {p.email}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.openedAt, true)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.clickedAt, true)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No opens or clicks yet.</p>
            )}
          </section>
        </>
      ) : null}
    </NewsletterFrame>
  );
}
