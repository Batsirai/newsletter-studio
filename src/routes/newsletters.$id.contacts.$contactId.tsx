import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Stat } from "@/client/components/Stat";
import { ContactStatus, formatDate, percent, SOURCE_LABEL } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { deleteContact, getContact, setContactStatus, updateContact } from "@/serverFunctions/contacts";

export const Route = createFileRoute("/newsletters/$id/contacts/$contactId")({
  loader: ({ params }) => getContact({ data: { newsletterId: params.id, contactId: params.contactId } }),
  component: ContactPage,
});

type Contact = NonNullable<ReturnType<typeof Route.useLoaderData>>;
type Status = Contact["status"];
type FieldValue = { type: "text" | "number" | "date"; value: string };
type Event = { id: string; type: string; detail: string; createdAt: string };

const ACTIONS: { to: Status; label: string; from: Status[] }[] = [
  { to: "active", label: "Mark active", from: ["dormant", "pending"] },
  { to: "active", label: "Resubscribe", from: ["unsubscribed"] },
  { to: "dormant", label: "Mark dormant", from: ["active"] },
  { to: "unsubscribed", label: "Unsubscribe", from: ["active", "dormant", "pending"] },
  { to: "bounced", label: "Mark bounced", from: ["active", "dormant", "pending", "unsubscribed", "complained"] },
  { to: "complained", label: "Mark complained", from: ["active", "dormant", "pending", "unsubscribed", "bounced"] },
];

const EVENT_LABEL: Record<string, string> = {
  signup: "Signed up",
  status: "Status",
  received: "Received",
  opened: "Opened",
  clicked: "Clicked",
};

function ContactPage() {
  const { id } = Route.useParams();
  const contact = Route.useLoaderData();
  if (!contact) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  return (
    <NewsletterFrame id={id} found>
      <ContactView key={contact.id + contact.status} newsletterId={id} contact={contact} />
    </NewsletterFrame>
  );
}

function ContactView({ newsletterId, contact }: { newsletterId: string; contact: Contact }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(contact.firstName);
  const [tags, setTags] = useState<string>((contact.tags as string[]).join(", "));
  const [fields, setFields] = useState(() => Object.entries(contact.fields as Record<string, FieldValue>).map(([name, f]) => ({ name, ...f })));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = { newsletterId, contactId: contact.id };

  const changeStatus = async (status: Status) => {
    try {
      await setContactStatus({ data: { ...ref, status } });
      await router.invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        backLink={
          <Link to="/newsletters/$id/contacts" params={{ id: newsletterId }} className="text-sm text-muted-foreground hover:text-foreground">
            Contacts
          </Link>
        }
        title={contact.email}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ContactStatus status={contact.status} testId="contact-status" />
            <span>
              {SOURCE_LABEL[contact.source] ?? contact.source} · signed up {formatDate(contact.createdAt)}
            </span>
          </span>
        }
        actions={ACTIONS.filter((a) => a.from.includes(contact.status)).map((a) => (
          <Button key={a.label} size="sm" variant="outline" onClick={() => void changeStatus(a.to)}>
            {a.label}
          </Button>
        ))}
      />
      <div className="grid gap-4 sm:grid-cols-3" data-testid="contact-rates">
        <Stat label="Emails received" value={contact.rates.sent} />
        <Stat label="Opens" value={percent(contact.rates.opened, contact.rates.sent)} />
        <Stat label="Clicks" value={percent(contact.rates.clicked, contact.rates.sent)} />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await updateContact({
              data: {
                ...ref,
                firstName,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                fields: Object.fromEntries(fields.filter((f) => f.name.trim()).map((f) => [f.name.trim(), { type: f.type, value: f.value }])),
              },
            });
            toast.success("Contact saved");
            await router.invalidate();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="ct-first" label="First name">
              <Input id="ct-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field id="ct-tags" label="Tags" hint="Separate with commas. Up to 50.">
              <Input id="ct-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <div className="space-y-2">
              <div className="text-sm font-medium">Fields</div>
              {fields.map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_1fr_auto] gap-2">
                  <Input aria-label="Field name" placeholder="Name" value={f.name} onChange={(e) => setFields((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <NativeSelect aria-label="Field type" value={f.type} onChange={(e) => setFields((all) => all.map((x, j) => (j === i ? { ...x, type: e.target.value as typeof f.type, value: "" } : x)))}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </NativeSelect>
                  <Input
                    aria-label="Field value"
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={f.value}
                    onChange={(e) => setFields((all) => all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove field" onClick={() => setFields((all) => all.filter((_, j) => j !== i))}>
                    <X aria-hidden />
                  </Button>
                </div>
              ))}
              {fields.length < 20 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setFields((all) => [...all, { name: "", type: "text", value: "" }])}>
                  <Plus aria-hidden /> Add field
                </Button>
              ) : null}
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                Delete contact
              </Button>
              <Button type="submit" pending={saving}>
                Save contact
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Activity</h2>
        <ol className="space-y-2 text-sm" data-testid="activity">
          {(contact.events as Event[]).map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-36 shrink-0 text-muted-foreground">{formatDate(e.createdAt, true)}</span>
              <span>
                <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                {e.detail ? <span className="text-muted-foreground"> · {e.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${contact.email}?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteContact({ data: ref });
              await navigate({ to: "/newsletters/$id/contacts", params: { id: newsletterId } });
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          Their history and stats go with them.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
