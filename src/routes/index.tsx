import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { errorMessage } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { createNewsletter, listNewsletters } from "@/serverFunctions/newsletters";

export const Route = createFileRoute("/")({
  loader: () => listNewsletters(),
  component: Home,
});

function Home() {
  const newsletters = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  const newButton = (
    <Button data-testid="new-newsletter" onClick={() => setOpen(true)}>
      <Plus aria-hidden /> New newsletter
    </Button>
  );
  return (
    <AppShell nav={<Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>}>
      <PageHeader title="Newsletters" actions={newsletters.length ? newButton : null} />
      {newsletters.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {newsletters.map((n) => (
            <li key={n.id} data-testid="newsletter-row">
              <Link to="/newsletters/$id" params={{ id: n.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="truncate font-medium">{n.name}</div>
                  <div className="truncate text-sm text-muted-foreground">/n/{n.slug}</div>
                </div>
                <div className="shrink-0 text-sm text-muted-foreground">{n.active} active</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No newsletters yet" description="Create one to start collecting subscribers." action={newButton} />
      )}
      {open ? <CreateDialog onClose={() => setOpen(false)} /> : null}
    </AppShell>
  );
}

function slugFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
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
              const { id } = await createNewsletter({ data: { name, slug } });
              await navigate({ to: "/newsletters/$id", params: { id } });
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New newsletter</DialogTitle>
          </DialogHeader>
          <Field id="nl-name" label="Name">
            <Input
              id="nl-name"
              value={name}
              required
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugFrom(e.target.value));
              }}
            />
          </Field>
          <Field id="nl-slug" label="URL slug" error={error}>
            <Input
              id="nl-slug"
              value={slug}
              required
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
