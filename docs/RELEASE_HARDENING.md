# Desktop UI release hardening — 28 October 2026

Status: local hardening pass complete; production release sign-off pending the
remaining verification below. No production deployment was performed.

## Fixes from this pass

| Issue | Fix | Verification |
|---|---|---|
| Products could display the prior shop's placeholder data during a shop switch | Only reuse data when the shop key matches | Deferred-response regression test |
| Product selection/dialog state survived a shop switch | Key the product workspace by shop | Selection and open-dialog regression test |
| Reports could show the prior shop's figures while loading | Match both shop and report before retaining placeholder data | Deferred-response regression test |
| Closing a dialog with Escape dropped keyboard focus to the document | Remember the opener, close on cleanup and restore focus if still connected | Unit test plus real browser: focus returned to Add product |

The approved password policy now has an eight-character minimum and a strength
score threshold of 2. Tests verify a varied eight-character password is accepted,
seven characters are rejected, and a common eight-character password is rejected.
The running local API was separately checked for eight-character acceptance.
Show/hide controls were verified in the browser: password → text → password.

## Automated checks

- Frontend: 81 tests passed; lint, TypeScript and production build passed.
- API: 229 unit tests and 187 integration tests passed (416 total). Integration
  tests used the dedicated scratch database, not the UI Audit Store.
- API changed-file Ruff lint and format checks passed.
- Whitespace checks passed in the web and API repositories.

## Browser checks

Chromium through the in-app browser, real local HTTPS frontend/API/database,
existing synthetic UI Audit Store data.

| Coverage | Widths | Result |
|---|---|---|
| All eight report routes | 1280, 320px | 16 checks; page width matched viewport; no visible report alerts |
| Home, Products, Billing list, New bill, Profile, Security, Team, Activity | 1920, 768, 320px | 24 checks; page width matched viewport |
| Product editor | 1280px | First field focused on open; Escape closed; focus restored to opener |
| Password visibility | Current account page | Show and hide toggled input type correctly |
| Stock valuation export | 320px | Excel download completed |

Raw route dimensions: `release-layout-checks.json`. These dimension checks detect
page overflow, not every visual, keyboard, data, or functional defect. Local table
scrolling is intentional. Browser warning/error log was empty at the inspected
checkpoint before the final dialog fix.

## Still required for release sign-off

- Cross-browser testing: excluded by the user; no longer a release requirement for this task.
- A full accessibility audit, screen-reader operation and true 200% browser zoom;
  the modal keyboard checks are a subset.
- Printed A4/A5 PDF output review and physical printer verification; earlier
  checkpoints checked screen previews only.
- Full report export contents/date-filter reconciliation, beyond one successful
  browser workbook download and automated report tests.
- Real email-delivery, signup/reset/MFA and role-change browser journeys using
  dedicated disposable accounts. Automated API integration coverage passed.
- Representative large-catalogue performance measurements.
- Production environment smoke check and rollout approval.

## Rollout and rollback notes

Before deploying, review the final diff and preserve the existing uncommitted work.
Build a tagged release artifact from the reviewed revision, retain the previous
frontend/API images, and smoke-test login, product lookup, report queries and a
dedicated test invoice in staging. These fixes require no database schema migration.
If rollback is needed, redeploy the previous reviewed images; do not reset or delete
local working-tree changes. Reconfirm the intended password policy on the target
environment, including any environment-variable override.


## Additional product validation

See the additional local UI validation checkpoint in `DESKTOP_UI_UPGRADE_PLAN.md`.
The current frontend suite has 84 passing tests. Product import locking, label
request errors and option-list error states were fixed; amber text contrast now
exceeds 5:1. A real CSV preview and label preview were checked, and all three product
CSV export rows reconciled with the catalogue. See `product-validation-results.json`.
Cross-browser testing is waived. True browser zoom, screen-reader operation,
printed PDF/printer output and large-catalogue timings are not certified here.


## Final code follow-ups

The five remaining implementation items are complete; see the final checkpoint
in `DESKTOP_UI_UPGRADE_PLAN.md`. Current frontend validation: 89 tests passed,
lint, TypeScript and production build passed. Native action disclosure and grouped
product forms were checked at desktop and 320px widths. Pending-write controls
and preserved product payloads have regression coverage.
