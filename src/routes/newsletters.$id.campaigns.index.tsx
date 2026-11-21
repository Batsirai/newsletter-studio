import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { CampaignStatus, formatDate } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { createCampaign, importPosts, listCampaigns } from "@/serverFunctions/campaigns";

export const Route = createFileRoute("/newsletters/$id/campaigns/")({
  loader: ({ params }) => listCampaigns({ data: { newsletterId: params.id } }),
  component: Campaigns,
});

function Campaigns() {
  const { id } = Route.useParams();
  const campaigns = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
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
      <PageHeader
        title="Campaigns"
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> Import posts
            </Button>
            {campaigns.length ? newButton : null}
          </>
        }
      />
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
      {importing ? <ImportPostsDialog newsletterId={id} onClose={() => setImporting(false)} onDone={() => router.invalidate()} /> : null}
    </NewsletterFrame>
  );
}

function ImportPostsDialog({ newsletterId, onClose, onDone }: { newsletterId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setPending(true);
            setError(null);
            try {
              const r = await importPosts({ data: { newsletterId, json: await file.text() } });
              const skipped = [
                r.existing ? `${r.existing} already here` : "",
                r.invalid ? `${r.invalid} not valid` : "",
                r.repeated ? `${r.repeated} repeated` : "",
              ].filter(Boolean);
              toast.success(`${r.added} posts added${skipped.length ? `. ${skipped.join(", ")}.` : ""}`);
              await onDone();
              onClose();
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import posts</DialogTitle>
          </DialogHeader>
          <Field
            id="p-file"
            label="JSON file"
            error={error}
            hint="A list of posts, each with subject, body (Markdown), sentAt, and optional slug and previewText. They are added as sent web issues and show on the newsletter's site. Nothing is emailed."
          >
            <Input id="p-file" type="file" accept=".json,application/json" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending} disabled={!file}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
