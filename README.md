# storelyweb

Desktop web app for Storely shop owners and staff (React, TypeScript, Vite, Node 26).
For **Vercel**, set `STORELY_API_ORIGIN` to the backend HTTPS origin. `vercel.ts`
configures API forwarding, SPA routes, and security headers. Use Node 24.x,
`npm run build`, and output directory `dist`. Full production setup is in
`../storelyapi/docs/DEPLOYMENT.md`.

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
