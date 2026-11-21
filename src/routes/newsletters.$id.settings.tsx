import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { CheckField, Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { deleteNewsletter, getNewsletter, updateNewsletter } from "@/serverFunctions/newsletters";

export const Route = createFileRoute("/newsletters/$id/settings")({
  loader: ({ params }) => getNewsletter({ data: { id: params.id } }),
  component: Settings,
});

function Settings() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  return (
    <NewsletterFrame id={id} found>
      <SettingsForm key={data.newsletter.id} newsletter={data.newsletter} origin={data.origin} />
    </NewsletterFrame>
  );
}

type Newsletter = NonNullable<ReturnType<typeof Route.useLoaderData>>["newsletter"];

function SettingsForm({ newsletter, origin }: { newsletter: Newsletter; origin: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    name: newsletter.name,
    slug: newsletter.slug,
    description: newsletter.description,
    fromName: newsletter.fromName,
    replyTo: newsletter.replyTo,
    postalAddress: newsletter.postalAddress,
    confirmOptIn: newsletter.confirmOptIn,
    welcomeEnabled: newsletter.welcomeEnabled,
    welcomeSubject: newsletter.welcomeSubject,
    welcomeBody: newsletter.welcomeBody,
    websiteEnabled: newsletter.websiteEnabled,
  }));
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: "name" | "slug" | "description" | "fromName" | "replyTo" | "postalAddress" | "welcomeSubject") => ({
    id: `s-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });
  const snippet = `<form method="post" action="${origin}/n/${newsletter.slug}/subscribe">
  <input type="hidden" name="source" value="embed">
  <input type="text" name="first_name" placeholder="First name">
  <input type="email" name="email" placeholder="Email" required>
  <button type="submit">Subscribe</button>
</form>`;

  return (
    <>
      <PageHeader title="Settings" />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            await updateNewsletter({ data: { id: newsletter.id, ...form } });
            toast.success("Saved");
            await router.invalidate();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Newsletter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="s-name" label="Name">
              <Input {...text("name")} required />
            </Field>
            <Field id="s-slug" label="URL slug" hint={`${origin}/n/${form.slug}`}>
              <Input {...text("slug")} required />
            </Field>
            <Field id="s-description" label="Description">
              <Textarea id="s-description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </Field>
            <CheckField label="Public website" checked={form.websiteEnabled} onChange={(v) => set("websiteEnabled", v)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sender</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="s-fromName" label="From name">
              <Input {...text("fromName")} />
            </Field>
            <Field id="s-replyTo" label="Reply-to address">
              <Input {...text("replyTo")} type="email" />
            </Field>
            <Field id="s-postalAddress" label="Postal address" hint="Printed in every email. Required to send.">
              <Input {...text("postalAddress")} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Signups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CheckField label="Confirmed opt-in" checked={form.confirmOptIn} onChange={(v) => set("confirmOptIn", v)} />
            <CheckField label="Welcome email" checked={form.welcomeEnabled} onChange={(v) => set("welcomeEnabled", v)} />
            {form.welcomeEnabled ? (
              <>
                <Field id="s-welcomeSubject" label="Welcome subject">
                  <Input {...text("welcomeSubject")} />
                </Field>
                <Field id="s-welcomeBody" label="Welcome message" hint="Markdown. {{first_name|fallback}} fills in the reader's name.">
                  <Textarea id="s-welcomeBody" value={form.welcomeBody} onChange={(e) => set("welcomeBody", e.target.value)} rows={5} />
                </Field>
              </>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" pending={pending}>
            Save changes
          </Button>
        </div>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Embedded signup form</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre data-testid="embed-snippet" className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {snippet}
          </pre>
          <CopyButton value={snippet} successMessage="Copied" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete newsletter</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete newsletter
          </Button>
        </CardContent>
      </Card>
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${newsletter.name}?`}
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteNewsletter({ data: { id: newsletter.id } });
              await navigate({ to: "/" });
            } catch (err) {
              toast.error(errorMessage(err));
              setDeleting(false);
            }
          }}
        >
          Its contacts, campaigns and stats are deleted for good.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
