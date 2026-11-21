import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import appCss from "@/client/styles/app.css?url";
import { buttonVariants } from "@/client/components/ui/button";

/** A public page for readers: the app's stylesheet, no scripts. */
export function publicPage(title: string, body: ReactNode, status = 200): Response {
  const html = renderToString(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href={appCss} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="bg-background text-foreground">
        <main className="mx-auto w-full max-w-2xl space-y-10 px-4 py-12 md:px-8">{body}</main>
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${html}`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'self'; img-src https: data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    },
  });
}

export function notFoundPage(): Response {
  return publicPage("Not found", <Message title="Page not found" />, 404);
}

export function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-8 text-card-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children ? <div className="space-y-3 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function SignupForm({ slug }: { slug: string }) {
  return (
    <form method="post" action={`/n/${slug}/subscribe`} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="source" value="website" />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input
        type="text"
        name="first_name"
        placeholder="First name"
        aria-label="First name"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm sm:w-36"
      />
      <input
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        aria-label="Email"
        className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
      />
      <button type="submit" className={buttonVariants()}>
        Subscribe
      </button>
    </form>
  );
}

export function PostButton({ action, label }: { action: string; label: string }) {
  return (
    <form method="post" action={action}>
      <button type="submit" className={buttonVariants({ variant: "outline" })}>
        {label}
      </button>
    </form>
  );
}

