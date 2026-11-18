# E00 web baseline and onboarding browser acceptance

Date: 18 November 2026. Inspected baseline: `6de0488` on `dev`, initially clean. Scope: current web checkout; no application theme/flow changed in this slice.

## Repo baseline

Host Node v26.13.0, npm 11.20.0, existing installed dependencies. Commands executed from `storelyweb`:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; rerun after new harness passed |
| `npm test` | Passed: 39 files, 352 tests |
| `npm run build` | Passed; 347 transformed modules |
| `node --check e2e/onboarding.cjs` | Passed |

Build warning: main JS chunk approximately 767 KB minified / 214 KB gzip; evaluate code splitting during performance work. Vitest emitted two jsdom “navigation to another Document” notices; unit tests do not prove real navigation or printing. No dependency audit, generated-schema regeneration or Docker image build performed in this web lane.

## Harness correction strategy

The historical `e2e/live.cjs` expects unrestricted Create shop onboarding and old Main navigation names (`Home`, `Billing`, `Team`, `Shop activity`). Current onboarding offers Premium requests/invitations, and navigation has changed. That large suite also spans many domain forms and account/security flows. It needs contract-by-contract refresh with a legitimate premium fixture. Changing a few labels would not establish that full suite is valid.

This slice adds `e2e/onboarding.cjs`, a bounded real-browser smoke for the current no-shop contract. It creates one uniquely named synthetic account through the real API, verifies real email through local Mailpit, signs in through React, checks onboarding and reload persistence, follows Request Premium, verifies no shop or Premium-request writes occurred, and deletes its account/mail in cleanup. No requests for paid access or business records are created. The test fails on browser runtime errors. It does not restart the API or change its rate limits.

Current-checkout Vite is used to avoid attributing results from an old built web image to current source. Run with an explicitly installed Playwright runtime and compatible Chromium:

```sh
# Terminal 1, current checkout; existing Docker API must already be available.
npm run dev -- --host 127.0.0.1

# Terminal 2; optional paths select an isolated runtime and existing browser.
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROME_EXECUTABLE=/absolute/path/to/chrome-headless-shell \
make e2e-onboarding
```

Default origin is `http://localhost:5173`; `STORELY_WEB_ORIGIN` can select another allowed local origin. Mailpit defaults to `http://127.0.0.1:8025`; override with `STORELY_MAIL_ORIGIN` for local container routing. Only local web/mail hosts are permitted. API calls use the current Vite proxy. Do not overlap with device/browser suites that restart the shared API. Chromium's development certificate exception is limited to this test context; TLS acceptance is a separate gate.

## Real browser result

`make e2e-onboarding` passed (exit 0) using temporary Playwright runtime `/tmp/storely-web-e00-runtime/node_modules/playwright` and the existing Chromium headless shell revision 1243. Current-checkout Vite served `http://localhost:5173`; requests reached the existing Docker API and Mailpit through the Vite proxy. The test did not restart/change API configuration. Synthetic account/mail cleanup succeeded.

An initial browser launch failed before API calls because the runtime expected an uncached browser revision; selecting the existing executable resolved it. The first executed scenario passed but its cleanup status assertion used the Playwright response API for a native fetch response; that harness typo was fixed and the complete test reran successfully. These attempts are not counted as separate passing tests.

## TLS/header observation

The Docker development override replaces the static web service with Vite. Strict web headers/CSP are configured in `storelyweb/docker/Caddyfile` and `Caddyfile.platform`, so running the production-oriented `make verify` against the Vite dev service can report missing web headers/strict CSP. That result is not a passing production check. Run and verify the built static image separately under coordinator control; do not weaken the static CSP to satisfy the dev server.

## Remaining E00 gates

- Refresh the broad live suite against current paid activation fixtures and business forms; no broad browser pass claimed here.
- Verify generated schema consistency with API owner and current build identities.
- Docker static image checks and full cross-client emulator reconciliation remain coordinator-owned.
- No physical printer, external provider, historical-data migration or human UX acceptance is established by this slice.
