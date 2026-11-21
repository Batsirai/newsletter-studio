import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { buttonVariants } from "@/client/components/ui/button";

const TABS = [
  { to: "/newsletters/$id", label: "Overview", exact: true },
  { to: "/newsletters/$id/contacts", label: "Contacts" },
  { to: "/newsletters/$id/segments", label: "Segments" },
  { to: "/newsletters/$id/campaigns", label: "Campaigns" },
  { to: "/newsletters/$id/settings", label: "Settings" },
] as const;

/** The shell for a newsletter's pages: its tabs, or not-found when it isn't the caller's. */
export function NewsletterFrame({ id, found, children }: { id: string; found: boolean; children: ReactNode }) {
  const nav = (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
      <Link to="/" className="shrink-0 text-muted-foreground hover:text-foreground">
        Newsletters
      </Link>
      {found
        ? TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ id }}
              activeOptions={{ exact: "exact" in tab }}
              className="shrink-0 text-muted-foreground hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              {tab.label}
            </Link>
          ))
        : null}
    </nav>
  );
  return (
    <AppShell nav={nav}>
      {found ? (
        children
      ) : (
        <EmptyState
          kind="error"
          title="Newsletter not found"
          action={
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Your newsletters
            </Link>
          }
        />
      )}
    </AppShell>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
