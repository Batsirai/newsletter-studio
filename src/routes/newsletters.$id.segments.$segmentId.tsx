import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { formatDate } from "@/client/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { getSegment } from "@/serverFunctions/segments";
import { SOURCE_LABEL } from "@/client/components/StatusBadge";

export const Route = createFileRoute("/newsletters/$id/segments/$segmentId")({
  loader: ({ params }) => getSegment({ data: { newsletterId: params.id, segmentId: params.segmentId } }),
  component: SegmentPage,
});

function SegmentPage() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  return (
    <NewsletterFrame id={id} found>
      <PageHeader
        backLink={
          <Link to="/newsletters/$id/segments" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground">
            Segments
          </Link>
        }
        title={data.name}
        description={`${data.contacts.length} of ${data.totalActive} active contacts`}
      />
      {data.contacts.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead className="hidden md:table-cell">Signed up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.contacts.map((c) => (
              <TableRow key={c.id} data-testid="contact-row">
                <TableCell>
                  <Link to="/newsletters/$id/contacts/$contactId" params={{ id, contactId: c.id }} className="font-medium hover:underline">
                    {c.email}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{SOURCE_LABEL[c.source]}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(c.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState kind="filtered" title="No active contacts match this segment" />
      )}
    </NewsletterFrame>
  );
}
