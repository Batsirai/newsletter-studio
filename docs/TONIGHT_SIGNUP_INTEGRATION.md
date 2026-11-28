# Authenticated TONIGHT signup claims — draft

Acceptance: Gateway-authenticated, owner- and publication-scoped claims; explicit versioned newsletter consent; idempotent claim and baseline; never reactivate or email an existing/suppressed contact; keep new contacts pending until an explicit confirmation POST. GET must be read-only to avoid inbox scanners activating a subscription. Receipt reads return confirmed new active acquisition only once per contact/claim, excluding existing/pending/suppressed/test/unknown.

The tools create no emails. A new pending claim returns a private confirmation URL for the AlreadyLoved Cloudflare email job. Do not log email, URL or tokens, put them in analytics, or use the internal tool request host as the public origin. A repeated claim returns the same link without sending a second confirmation. An uncertain tool call is reconciled by claim ID before a caller performs any send.

Feature settings bind the approved publication and canonical public HTTPS origin. No values are configured in production by this PR. Use an app-bound Gateway write token for AlreadyLoved; do not use a founder-wide token. Tools receive identity only from SDK context and scope every database operation through the owned approved newsletter. The public confirmation route is a narrow token capability, not a member login.

No deployment, live signup, contact import, live mail, credentials provision, newsletter setting change or campaign activation is included. Existing signup/confirmation behavior stays unchanged outside the new integration route. PR #8 edits newsletter/footer behavior and must be reconciled before release; this draft does not call its mail path.

## Verification and review

The local SQLite suite now covers two reproduced review races: outside activation at the exact same timestamp, and a delayed claim inserting after another claim was confirmed and its contact deleted. Both tests failed before the repair. Confirmation proof now depends on the previous conditional UPDATE changing one row in the same batch (`changes()`), rather than clock equality; the durable first-recipient reservation has a partial unique publication/recipient-hash index. Only that first reservation can be a new acquisition. Existing/suppressed claims never gain confirmation links.

The new confirmation capability is consumed once; it cannot reactivate a pending resubscription through an old link. Existing public confirmation routes are unchanged. Receipt metadata contains publication, source/variant and consent/confirmation timestamps for reconciliation, without email, URL or tokens.

SQL contract: https://www.sqlite.org/lang_corefunc.html#changes . The SQLite tests exercise the migration and batch behavior; live D1/EveryApp integration remains unverified and held.

The consumed-token regression also pauses an old confirmation while a newer request confirms and the actual legacy public signup path creates another pending resubscription (mail mocked). The old request cannot activate that later pending state: consumption and expiry are checked again inside the contact UPDATE. Both the initial counting races and this lifecycle race failed before their repairs and pass afterward. Final independent review found no remaining actionable issue in those repairs.

## Accepted local checks

59 tests pass (29 new SQLite/SDK/confirmation tests plus 30 existing tests), production build and `pnpm types:check` pass, changed-file Prettier passes, and the EveryApp security review found no remaining actionable issue after the three repairs. Tests mock mail and use an isolated in-memory database. No live Gateway tool call, D1 migration, signup, email, feature configuration or token provisioning occurred.

Still held before the complete Instagram flow ships: live tool deployment/configuration and app-bound credentials; AlreadyLoved caller/guide/email wiring; STOP reconciliation with an outstanding newsletter claim; and hosted browser/provider checks. These local receipts do not prove a production signup or delivered message.
