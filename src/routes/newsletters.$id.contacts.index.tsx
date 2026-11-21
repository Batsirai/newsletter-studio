import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { ContactStatus, formatDate, SOURCE_LABEL } from "@/client/components/StatusBadge";
import { Badge } from "@/client/components/ui/badge";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { addContact, bulkContacts, importContacts, listContacts } from "@/serverFunctions/contacts";

const STATUSES = ["active", "pending", "dormant", "unsubscribed", "bounced", "complained"] as const;
const SOURCES = ["website", "embed", "manual"] as const;

const search = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/newsletters/$id/contacts/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => listContacts({ data: { newsletterId: params.id, ...deps } }),
  component: Contacts,
});

type Bulk = null | "addTag" | "removeTag" | "status" | "delete" | "segment";

function Contacts() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<Bulk>(null);
  const [q, setQ] = useState(filters.q ?? "");
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;

  const setFilter = (change: Partial<Search>) => {
    setSelected([]);
    void navigate({ search: (prev) => ({ ...prev, ...change, page: undefined }) });
  };
  const filtered = Boolean(filters.q || filters.status || filters.source || filters.tag || filters.from || filters.to);
  const exportQuery = new URLSearchParams(
    Object.entries({ ...filters, page: undefined }).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString();
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const refresh = async () => {
    setSelected([]);
    await router.invalidate();
  };

  return (
    <NewsletterFrame id={id} found>
      <PageHeader
        title="Contacts"
        description={`${data.total} ${filtered ? "matching" : "in total"}`}
        actions={
          <>
            <a href={`/export/contacts/${id}${exportQuery ? `?${exportQuery}` : ""}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Export CSV
            </a>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> Import CSV
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add contact
            </Button>
          </>
        }
      />
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ q: q.trim() || undefined });
          }}
        >
          <Input aria-label="Search email" placeholder="Search email, * for any text" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <NativeSelect aria-label="Status" value={filters.status ?? ""} onChange={(e) => setFilter({ status: (e.target.value || undefined) as Search["status"] })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Source" value={filters.source ?? ""} onChange={(e) => setFilter({ source: (e.target.value || undefined) as Search["source"] })}>
            <option value="">Any source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Tag" value={filters.tag ?? ""} onChange={(e) => setFilter({ tag: e.target.value || undefined })}>
            <option value="">Any tag</option>
            {data.allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" aria-label="Signed up from" value={filters.from ?? ""} onChange={(e) => setFilter({ from: e.target.value || undefined })} />
          <Input type="date" aria-label="Signed up to" value={filters.to ?? ""} onChange={(e) => setFilter({ to: e.target.value || undefined })} />
        </div>
      </div>

      {selected.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 p-2">
          <span className="px-2 text-sm font-medium">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => setBulk("addTag")}>Add tag</Button>
          <Button size="sm" variant="outline" onClick={() => setBulk("removeTag")}>Remove tag</Button>
          <Button size="sm" variant="outline" onClick={() => setBulk("status")}>Change status</Button>
          <Button size="sm" variant="outline" onClick={() => setBulk("segment")}>Create segment</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulk("delete")}>Delete</Button>
        </div>
      ) : null}

      {data.rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={selected.length === data.rows.length}
                  onCheckedChange={(v) => setSelected(v ? data.rows.map((r) => r.id) : [])}
                />
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead className="hidden md:table-cell">Signed up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((c) => (
              <TableRow key={c.id} data-testid="contact-row">
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${c.email}`}
                    checked={selected.includes(c.id)}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                  />
                </TableCell>
                <TableCell className="max-w-56 truncate">
                  <Link to="/newsletters/$id/contacts/$contactId" params={{ id, contactId: c.id }} className="font-medium hover:underline">
                    {c.email}
                  </Link>
                  {c.firstName ? <div className="truncate text-xs text-muted-foreground">{c.firstName}</div> : null}
                </TableCell>
                <TableCell>
                  <ContactStatus status={c.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{SOURCE_LABEL[c.source] ?? c.source}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(c.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : filtered ? (
        <EmptyState kind="filtered" title="No contacts match these filters" />
      ) : (
        <EmptyState title="No contacts yet" description="Add one by hand, or share the signup form from Settings." />
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => void navigate({ search: (p) => ({ ...p, page: data.page - 1 }) })}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={data.page >= pages} onClick={() => void navigate({ search: (p) => ({ ...p, page: data.page + 1 }) })}>
            Next
          </Button>
        </div>
      ) : null}

      {importing ? <ImportDialog newsletterId={id} onClose={() => setImporting(false)} onDone={refresh} /> : null}
      {adding ? <AddDialog newsletterId={id} onClose={() => setAdding(false)} onDone={refresh} /> : null}
      {bulk ? <BulkDialog kind={bulk} newsletterId={id} ids={selected} onClose={() => setBulk(null)} onDone={refresh} /> : null}
    </NewsletterFrame>
  );
}

function splitTags(value: string) {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

function AddDialog({ newsletterId, onClose, onDone }: { newsletterId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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
              await addContact({ data: { newsletterId, email, firstName, tags: splitTags(tags) } });
              await onDone();
              onClose();
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
          </DialogHeader>
          <Field id="c-email" label="Email" error={error}>
            <Input id="c-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="c-first" label="First name">
            <Input id="c-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field id="c-tags" label="Tags" hint="Separate with commas.">
            <Input id="c-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ newsletterId, onClose, onDone }: { newsletterId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
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
              const r = await importContacts({ data: { newsletterId, csv: await file.text(), tags: splitTags(tags) } });
              const skipped = [
                r.existing ? `${r.existing} already on the list` : "",
                r.unsubscribed ? `${r.unsubscribed} added as unsubscribed` : "",
                r.invalid ? `${r.invalid} not valid` : "",
                r.repeated ? `${r.repeated} repeated` : "",
              ].filter(Boolean);
              toast.success(`${r.added} contacts added${skipped.length ? `. ${skipped.join(", ")}.` : ""}`);
              await onDone();
              onClose();
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import contacts</DialogTitle>
          </DialogHeader>
          <Field
            id="i-file"
            label="CSV file"
            error={error}
            hint="Needs an email column. First name and status columns are read when present. People already on the list stay as they are, and anyone the file marks as unsubscribed is never emailed. No confirmation or welcome email is sent."
          >
            <Input id="i-file" type="file" accept=".csv,text/csv" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field id="i-tags" label="Tags" hint="Added to every new contact. Separate with commas.">
            <Input id="i-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
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

const BULK_TITLE: Record<Exclude<Bulk, null>, string> = {
  addTag: "Add tag",
  removeTag: "Remove tag",
  status: "Change status",
  delete: "Delete contacts",
  segment: "Create segment",
};

function BulkDialog({
  kind,
  newsletterId,
  ids,
  onClose,
  onDone,
}: {
  kind: Exclude<Bulk, null>;
  newsletterId: string;
  ids: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [value, setValue] = useState(kind === "status" ? "dormant" : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const base = { newsletterId, ids };
      const result =
        kind === "addTag" || kind === "removeTag"
          ? await bulkContacts({ data: { ...base, action: kind, tag: value } })
          : kind === "status"
            ? await bulkContacts({ data: { ...base, action: "status", status: value as (typeof STATUSES)[number] } })
            : kind === "delete"
              ? await bulkContacts({ data: { ...base, action: "delete", confirm: Number(value) } })
              : await bulkContacts({ data: { ...base, action: "segment", name: value } });
      if (kind === "status" && result.changed < ids.length) toast(`${result.changed} of ${ids.length} changed`);
      await onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{BULK_TITLE[kind]}</DialogTitle>
          </DialogHeader>
          {kind === "addTag" || kind === "removeTag" ? (
            <Field id="b-tag" label="Tag" error={error}>
              <Input id="b-tag" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          ) : kind === "segment" ? (
            <Field id="b-seg" label="Segment name" hint="The selected contacts get a tag with this name." error={error}>
              <Input id="b-seg" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          ) : kind === "status" ? (
            <Field id="b-status" label="New status" hint="Bounced and complained contacts can't be made active or dormant." error={error}>
              <NativeSelect id="b-status" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="active">Active</option>
                <option value="dormant">Dormant</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
              </NativeSelect>
            </Field>
          ) : (
            <Field id="b-confirm" label={`Type ${ids.length} to delete ${ids.length} contacts for good`} error={error}>
              <Input id="b-confirm" inputMode="numeric" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              pending={pending}
              variant={kind === "delete" ? "destructive" : "default"}
              disabled={kind === "delete" && Number(value) !== ids.length}
            >
              {kind === "delete" ? "Delete" : BULK_TITLE[kind]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
