import { createFileRoute, Link } from "@tanstack/react-router";
import { NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Stat } from "@/client/components/Stat";
import { formatDate, percent } from "@/client/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { getNewsletterOverview } from "@/serverFunctions/newsletters";

export const Route = createFileRoute("/newsletters/$id/")({
  loader: ({ params }) => getNewsletterOverview({ data: { id: params.id } }),
  component: Overview,
});

function Overview() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  const max = Math.max(1, ...data.days.map((d) => d.signups));
  const last30 = data.days.reduce((sum, d) => sum + d.signups, 0);
  return (
    <NewsletterFrame id={id} found>
      <PageHeader
        title={data.newsletter.name}
        description={
          data.newsletter.websiteEnabled ? (
            <a href={`/n/${data.newsletter.slug}`} target="_blank" rel="noreferrer" className="hover:text-foreground">
              /n/{data.newsletter.slug}
            </a>
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active subscribers" value={data.active} testId="stat-active" />
        <Stat label="All contacts" value={data.total} />
        <Stat label="Signups, last 30 days" value={last30} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Signups</CardTitle>
        </CardHeader>
        <CardContent>
          <div data-testid="signups-chart" className="flex h-32 items-end gap-1" role="img" aria-label={`${last30} signups in the last 30 days`}>
            {data.days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 items-end" title={`${d.day}: ${d.signups}`}>
                <div className="w-full rounded-t-sm bg-primary" style={{ height: `${Math.max(d.signups ? 6 : 1, (d.signups / max) * 100)}%`, opacity: d.signups ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatDate(data.days[0]!.day)}</span>
            <span>{formatDate(data.days[data.days.length - 1]!.day)}</span>
          </div>
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent campaigns</h2>
        {data.recent.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((c) => (
                <TableRow key={c.id} data-testid="recent-campaign">
                  <TableCell className="font-medium">
                    <Link to="/newsletters/$id/campaigns/$campaignId/report" params={{ id, campaignId: c.id }} className="hover:underline">
                      {c.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.sentAt)}</TableCell>
                  <TableCell className="text-right">{c.destination === "web" ? "–" : percent(c.opened, c.delivered)}</TableCell>
                  <TableCell className="text-right">{c.destination === "web" ? "–" : percent(c.clicked, c.delivered)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Sent campaigns will appear here.</p>
        )}
      </section>
    </NewsletterFrame>
  );
}
