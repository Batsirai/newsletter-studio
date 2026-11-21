import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { SOURCE_LABEL } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { deleteSegment, listSegments, saveSegment } from "@/serverFunctions/segments";

export const Route = createFileRoute("/newsletters/$id/segments/")({
  loader: ({ params }) => listSegments({ data: { newsletterId: params.id } }),
  component: Segments,
});

type Rules = { tagsAny: string[]; tagsAll: string[]; source: "website" | "embed" | "manual" | null; after: string | null; before: string | null };

function describeRules(r: Rules): string {
  const parts: string[] = [];
  if (r.tagsAny.length) parts.push(`any of ${r.tagsAny.join(", ")}`);
  if (r.tagsAll.length) parts.push(`all of ${r.tagsAll.join(", ")}`);
  if (r.source) parts.push(`from ${SOURCE_LABEL[r.source]?.toLowerCase()}`);
  if (r.after) parts.push(`signed up after ${r.after}`);
  if (r.before) parts.push(`signed up before ${r.before}`);
  return parts.join(" · ") || "Every active contact";
}

function Segments() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden /> New segment
    </Button>
  );
  return (
    <NewsletterFrame id={id} found>
      <PageHeader title="Segments" actions={data.segments.length ? newButton : null} />
      {data.segments.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.segments.map((s) => (
            <li key={s.id} data-testid="segment-row" className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link to="/newsletters/$id/segments/$segmentId" params={{ id, segmentId: s.id }} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <div className="truncate text-sm text-muted-foreground">{describeRules(s.rules)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {s.reach} of {data.totalActive} active
                </span>
                <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setRemoving(s)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No segments yet" description="Create one to pick contacts by tag, source or signup date." action={newButton} />
      )}
      {creating ? (
        <SegmentDialog
          newsletterId={id}
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false);
            await router.invalidate();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteSegment({ data: { newsletterId: id, segmentId: removing.id } });
              setRemoving(null);
              await router.invalidate();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          Drafts sent to it will need a new audience.
        </ConfirmDialog>
      ) : null}
    </NewsletterFrame>
  );
}

function SegmentDialog({ newsletterId, onClose, onDone }: { newsletterId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [any, setAny] = useState("");
  const [all, setAll] = useState("");
  const [source, setSource] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const split = (v: string) => v.split(",").map((t) => t.trim()).filter(Boolean);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            try {
              await saveSegment({
                data: {
                  newsletterId,
                  name,
                  rules: {
                    tagsAny: split(any),
                    tagsAll: split(all),
                    source: (source || null) as Rules["source"],
                    after: after || null,
                    before: before || null,
                  },
                },
              });
              await onDone();
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New segment</DialogTitle>
          </DialogHeader>
          <Field id="sg-name" label="Name" error={error}>
            <Input id="sg-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="sg-any" label="Has any of these tags" hint="Separate with commas.">
            <Input id="sg-any" value={any} onChange={(e) => setAny(e.target.value)} />
          </Field>
          <Field id="sg-all" label="Has all of these tags">
            <Input id="sg-all" value={all} onChange={(e) => setAll(e.target.value)} />
          </Field>
          <Field id="sg-source" label="Source">
            <NativeSelect id="sg-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Any source</option>
              <option value="website">Website</option>
              <option value="embed">Embedded form</option>
              <option value="manual">Manual</option>
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="sg-after" label="Signed up after">
              <Input id="sg-after" type="date" value={after} onChange={(e) => setAfter(e.target.value)} />
            </Field>
            <Field id="sg-before" label="Signed up before">
              <Input id="sg-before" type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Save segment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
