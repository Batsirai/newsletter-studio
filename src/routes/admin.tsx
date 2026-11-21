import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { errorMessage } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { adminPauseCampaign, getAdminOverview } from "@/serverFunctions/admin";

export const Route = createFileRoute("/admin")({
  loader: () => getAdminOverview(),
  component: Admin,
});

function Admin() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const nav = <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Newsletters</Link>;
  if (!data.allowed) {
    return (
      <AppShell nav={nav}>
        <PageHeader title="Admin" />
        <EmptyState kind="error" title="Only workspace admins can open this page." />
      </AppShell>
    );
  }
  return (
    <AppShell nav={nav}>
      <PageHeader title="All newsletters" />
      {data.sending.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sending now</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.sending.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.subject}</div>
                  <div className="text-sm text-muted-foreground">{c.newsletter}</div>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await adminPauseCampaign({ data: { campaignId: c.id } });
                      await router.invalidate();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  Pause
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.newsletters.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Newsletter</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.newsletters.map((n) => (
              <TableRow key={n.id} data-testid="admin-newsletter-row">
                <TableCell className="font-medium">{n.name}</TableCell>
                <TableCell className="text-muted-foreground">{n.owner}</TableCell>
                <TableCell className="text-right">{n.active}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No newsletters in this workspace yet" />
      )}
    </AppShell>
  );
}
