# storelyweb

Desktop web app for Storely shop owners and staff (React, TypeScript, Vite, Node 26).
For **Vercel**, set `STORELY_API_ORIGIN` to the backend HTTPS origin. `vercel.ts`
configures API forwarding, SPA routes, and security headers. Use Node 24.x,
`npm run build`, and output directory `dist`. Full production setup is in
`../storelyapi/docs/DEPLOYMENT.md`.

## Code layout

`src/` groups business features by domain. Shared layout and UI primitives live
in `src/components/layout/` and `src/components/ui/`; account, authentication,
shop, and dashboard pages are grouped under `src/pages/`. Larger features keep
related pieces together, such as invoices, product components and suppliers,
and the purchase composer.

## First Vercel deployment

Import `rudra273/storelyweb` as a new Vercel project. This frontend currently uses
`main`; the API's `dev` workflow does not change the frontend branch. Select Vite,
repository root `./`, Node 24.x, install command `npm ci`, build command
`npm run build`, and output directory `dist`.

Before deploying, add this environment variable for **Production**:

```dotenv
STORELY_API_ORIGIN=https://storelyapi.rosmox.com
```

The backend is deployed on Render with Supabase PostgreSQL and Brevo delivery.
API development and testing use `dev` in `storelyapi`, with PRs merged into `main`
for automatic production deployment. Confirm the manually created
Render service's Branch setting tracks `main` with auto-deploy enabled. Local Git branch changes and
`render.yaml` edits do not update a manually created Render service automatically.

`vercel.ts` exports the named `config` required by Vercel and reads the API origin
at build time. Do not add `/v1` to the value or use a `VITE_*` variable. Browser
requests stay on the frontend's origin and Vercel forwards them to the API,
including the secure refresh cookie. No Brevo key, database password, or API
signing/encryption keys belong in the frontend project.

Leave Preview disconnected from production unless deliberately testing against
the live database. For an isolated preview, supply a separate backend origin;
without this variable the Vercel configuration intentionally refuses to build.
Redeploy after changing the variable.

After deploying, check `/health/ready` on the Vercel hostname, refresh `/login`
directly, then verify signup/email confirmation, login, reload/session refresh,
password reset and logout. A successful static build does not verify live cookie
forwarding or account flows.

## Local development

For a future Cloud Run frontend, build Docker target `platform` and set
`STORELY_API_ORIGIN` to the backend HTTPS origin. That container serves HTTP on
`PORT` behind platform HTTPS and forwards API requests on the same origin.

Master plan: `/Users/rudra/projects/Storely/plan.md`. The API lives in
`/Users/rudra/projects/storelyapi`. Everything runs in Docker; you only need Docker.

```bash
make check      # lint, typecheck, tests, production build, dependency audit
make test       # just the tests
make lock       # refresh package-lock.json after editing package.json
```

Start the local stack with `make up` in `../storelyapi`, then open
`https://app.storely.localhost`. Sign-in, account security, shops/team, products,
imports/labels and reports are implemented. Staff see only permitted pages.

Billing routes are `/billing` (list/search), `/billing/new` (server-priced cart),
and `/billing/:id` (details, payments, owner/admin returns and cancellation).
Invoice preview prints on A4/A5; choose **Save as PDF** in the browser print dialog.
Creation, payment and return retries retain their original idempotency key and
exact body while the page/dialog stays open. Details stay locked after an uncertain
response, and Retry safely confirms the same operation. After navigation/reload,
inspect the current bill before intentionally starting a new operation.

After changing API responses, run `make openapi` in `../storelyapi` and
`make api-types` here. `make e2e` exercises the real stack with temporary users,
including staff billing and owner returns; `SHOTS=/tmp/storely-shots` saves images.

Rules: no tokens in `localStorage`, no `dangerouslySetInnerHTML` or `eval` (the
linter enforces both), and the server is the source of truth for money totals.

The `caddy` Docker target is shared by the web server and front proxy. It rebuilds
upstream Caddy 2.11.7 with Go 1.26.10 and x/net 0.60.0 and upgrades Alpine security
packages; the unmodified official image still contained fixable high findings at
review time. The module graph is locked in `docker/caddy-build/go.mod` and `go.sum`.
`make scan-image` checks the actual production image and also runs in CI. Revisit
this rebuild when upstream publishes an image with these fixes incorporated.

The developer console is at `/platform`, independent of shop onboarding. It has
platform KPIs, premium request review, searchable shop metadata, subscription
controls and append-only audit history. A shop owner/admin role does not grant
access. A database operator must provision a verified account using the API repo's
`python -m scripts.platform_admin grant EMAIL` CLI; enable MFA at
`/platform/account/security`, then sign out and sign in again. No developer
credentials are bundled. All console API types are generated from OpenAPI.

Run `make test-platform-console` in `../storelyapi` for the real local browser
workflow. It uses unique throwaway users and cleans up their developer grant.

Paid web business access is checked before rendering. Free, expired, suspended and
scheduled shops see `/subscription`; account/security remains available without a
shop. First activation is requested and completed on Android; renewals are manual
updates to the existing shop by the Storely team. Approved request status is bound
to the verified account UUID. Pending requests remain tracked privately on Android.

In the API repo, `make test-subscription-lifecycle` exercises real browser access,
expiry/renewal and staff revocation; `make test-local-load` adds a bounded local TLS
read load. The API is deployed; hosted frontend account-flow acceptance and the
remaining operational checks are still pending. See `../storelyapi/docs/OPERATIONS.md`.

Authenticator setup on both account-security routes includes a locally generated
QR code and manual-key fallback. Secrets are not sent to a QR service or saved in
browser storage; setup state is cleared on cancel or successful enrollment. The
browser acceptance flow decodes the actual QR before completing MFA setup/login.

Web request submission is now available at `/request-premium` (also linked from
onboarding, subscription status and the developer navigation). Choose an existing
Android shop and copy its shop code, or explicitly choose a new web shop. Enter
contact name/phone and consent. Track pending/review/approval under the same account;
new web shops have a confirmed activation button, while existing Android shops keep
their backup/upload activation on the phone. No request starts an automatic charge.
