import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { CampaignStatus, formatDate } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { createCampaign, listCampaigns } from "@/serverFunctions/campaigns";

export const Route = createFileRoute("/newsletters/$id/campaigns/")({
  loader: ({ params }) => listCampaigns({ data: { newsletterId: params.id } }),
  component: Campaigns,
});

function Campaigns() {
  const { id } = Route.useParams();
  const campaigns = Route.useLoaderData();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  if (!campaigns) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  const newButton = (
    <Button
      pending={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { id: campaignId } = await createCampaign({ data: { newsletterId: id } });
          await navigate({ to: "/newsletters/$id/campaigns/$campaignId", params: { id, campaignId } });
        } catch (err) {
          toast.error(errorMessage(err));
          setPending(false);
        }
      }}
    >
      <Plus aria-hidden /> New campaign
    </Button>
  );
  return (
    <NewsletterFrame id={id} found>
      <PageHeader title="Campaigns" actions={campaigns.length ? newButton : null} />
      {campaigns.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
              <TableHead className="hidden text-right md:table-cell">Recipients</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id} data-testid="campaign-row">
                <TableCell className="max-w-72 truncate font-medium">
                  <Link to="/newsletters/$id/campaigns/$campaignId" params={{ id, campaignId: c.id }} className="hover:underline">
                    {c.subject || "Untitled"}
                  </Link>
                </TableCell>
                <TableCell>
                  <CampaignStatus status={c.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDate(c.status === "scheduled" ? c.scheduledAt : (c.sentAt ?? c.createdAt), true)}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">{c.destination === "web" ? "Web" : c.recipients}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No campaigns yet" action={newButton} />
      )}
    </NewsletterFrame>
  );
}
