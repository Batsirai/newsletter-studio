# Newsletter Studio

Write email newsletters, keep a list of subscribers, and publish each issue on a public website with a signup form.

Inspired by https://mailcheap.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create newsletters with a public URL, sender details, postal address, confirmed opt-in and a welcome email.
- Keep contacts with statuses, tags and custom fields; search, filter, edit in bulk, import and export CSV.
- Group contacts into segments by tags, source and signup date.
- Write campaigns in Markdown with a live preview, review them, send a test, then send now or schedule, with pause and resume.
- Publish issues on a public site with signup, embeddable form, confirmation and one-click unsubscribe.
- See opens, clicks, unsubscribes and page views per campaign, and subscriber growth per newsletter.

Left out: accounts and sign-in, which your Gateway handles; automations; custom domains; themes; an API; billing.

## Setup

- Install: `pnpm install`. Test: `pnpm test` for unit tests; `checks/` holds the release checks.
- Run locally: `pnpm dev`. Deploy: `pnpm run deploy`.
- No secrets or settings. Mail goes through the Gateway's email capability, so the Gateway needs a sender (`everyapp configure`). To send as a newsletter's from name, allow a sender for the app with `everyapp email set --sender '*@your-domain'`; each newsletter then sends as `<slug>@your-domain`.

## Limitations

- Without an app sender, mail goes out under the Gateway's own sender address and name.
- The Gateway's daily email budget applies; a send that hits it pauses and can be resumed later.
- Bounces and complaints aren't reported back automatically; mark those contacts by hand.
- Sending and real delivery weren't tested against a live Gateway, only against a local stand-in.
