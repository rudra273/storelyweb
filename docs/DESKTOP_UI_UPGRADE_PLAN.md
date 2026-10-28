# Storely desktop UI upgrade

Date: 28 October 2026
Status: core redesign and the five remaining code refinements are implemented locally. Validation history and remaining environment-dependent release checks are recorded below.

## Outcome and scope

Make the React desktop web app feel like a finished inventory and billing product: clear hierarchy, efficient tables, predictable actions, and straightforward daily workflows. Preserve Storely's navy and amber identity. Prioritize Products and Reports, then Billing, as specified in the project brief.

Primary implementation repository: `/Users/rudra/projects/storelyweb`. The Flutter app is outside this redesign. Change the API only where a reproduced defect or an agreed UI requirement requires it; keep server-authoritative money calculations and existing permission boundaries.

## Findings from code inspection

- `src/components/AppLayout.tsx`: role-aware navigation and shop switching already exist. Build on these; improve grouping, icons, account placement, active states, and page context.
- `src/pages/Home.tsx`: home currently provides a greeting, navigation tiles, and an account card. It does not yet provide an operational overview.
- `src/index.css`: basic tokens exist, but page content is capped at 64rem and cards at 40rem. Tables, forms, and actions rely on broad global selectors. Introduce deliberate page layouts and reusable component variants instead of accumulating overrides.
- `src/components/ui.tsx`: fields, alerts, loading, empty states, and cards exist. Extend this foundation with consistent buttons, page headers, toolbars, status badges, tables, and feedback.
- Product search, filtering, sorting, pagination, details, import/export, stock adjustment, and labels already exist. Reports and billing also have working implementations; redesign these workflows without duplicating them.
- `docs/UI_TESTING.md` records an earlier real-browser audit and fixes. Its results are historical evidence, not validation of the upcoming redesign. Existing uncommitted changes include modal focus, responsive tables, invoices, and billing; preserve and recheck them.
- No new runtime defect is claimed from this planning pass. Suspected issues must be reproduced before being classified as bugs.

## Design direction

Use a restrained light workspace with white surfaces, subtle borders, navy primary actions, and amber highlights. Establish a clear typography scale, consistent spacing, restrained radii, and one icon style. Use tabular numerals for financial and stock data. Avoid decorative charts, oversized cards, excessive shadows, and dense walls of equally prominent buttons.

Keep one obvious primary action per page. Put less frequent actions in a clearly labelled secondary menu. Show advanced fields progressively. Give tables adequate room on desktop while keeping forms readable. Every control must do real work; display only data supported by existing permissions and API contracts.

## Phase 1 — Baseline and workflow audit

1. Inventory routes, dialogs, permissions, API dependencies, and existing worktree changes.
2. Run the existing lint, typecheck, test, and build checks; record pre-existing failures separately.
3. Capture current screens with synthetic data at 1280, 1440, and 1920px desktop widths; check 768 and 390px fallback layouts.
4. Walk through product lookup/edit, import, stock adjustment, report filtering/export, bill creation/payment, and account access. Include empty, loading, error, and permission-limited states.
5. Maintain a bug ledger with reproduction steps, expected/actual behavior, severity, affected role, and verification evidence. Prioritize data correctness and blocked workflows.

Deliverable: baseline screenshots, reproducible bug ledger, and a route/state coverage checklist.
Exit: distinguish visual shortcomings from functional defects and document the baseline clearly.

## Phase 2 — Design system and application shell

1. Define semantic colors, type sizes, spacing, radii, elevation, focus, and interaction tokens.
2. Upgrade shared buttons, fields, validation, badges, cards, dialogs, empty/error/loading states, page headers, and table toolbars.
3. Redesign sidebar navigation with consistent icons and logical groups; make shop and account context easy to identify.
4. Add a consistent page header and responsive content layouts. Use wide workspaces for tables and bounded widths for forms.
5. Build Products as the representative screen for visual review before rolling the style across the app.

Testing: keyboard navigation, visible focus, dialog Escape/focus restoration, contrast, long names, zoom, and narrow-window overflow. Run component checks and the existing suite.
Exit: shell and representative Products screen form a coherent, usable visual foundation.

## Phase 3 — Products and inventory

1. Build a unified search/filter/action toolbar with active-filter visibility and easy reset.
2. Improve table density, column alignment, selection, stock indicators, pagination, and row actions.
3. Refine the product detail panel and stock history without obscuring the catalogue; preserve search and filter context.
4. Group product fields into understandable sections; simplify add/edit, stock adjustment, import preview/results, categories/units, and label printing.
5. Make restricted actions and purchase-side information respect current role capabilities.

Testing: search/filter/sort combinations, paging, selection, browser back, shop switching, validation, duplicate codes, insufficient stock, import failures, exports, and labels. Test realistic long names and a populated catalogue. Add regression coverage for reproduced defects.
Exit: an owner can manage the catalogue efficiently; staff can look up permitted data without seeing restricted fields.

## Phase 4 — Home and reports

1. Replace the navigation-tile-only home with a focused work summary and relevant shortcuts. Reuse authorized existing report data; staff receive an appropriate task-focused home.
2. Standardize report navigation, date ranges, summaries, tables, charts, and export placement across all eight existing views.
3. Make units, dates, totals, and status meanings clear. Empty data must be distinguishable from failed requests.
4. Provide useful recovery for failed queries and exports while preserving selected filters.

Testing: date boundaries, zero/negative values, large values, missing data, report permissions, reload/back navigation, request failures, and downloaded data matching filters. Compare displayed figures with server responses.
Exit: users can understand performance and find/export the relevant report without hunting through controls.

## Phase 5 — Billing workspace

1. Create a desktop workspace with product search/cart and a clear summary/payment area; stack safely on smaller windows.
2. Simplify customer entry and quantity editing; make validation actionable and totals legible.
3. Improve bill history filters, payment-status visibility, bill details, and available actions.
4. Polish invoice screen preview while preserving A4/A5 print layouts.
5. Preserve server pricing, stale-preview protection, explicit confirmation, and safe save/retry behavior.

Testing: catalogue-to-invoice price consistency, discounts/tax/round-off, partial payments, stock rejection, rapid quantity changes, preview failures, double submission, lost-response retries, cancellation, and print output. Use isolated test data.
Exit: a bill can be created, reviewed, saved, retrieved, and printed without unclear states or correctness regressions.

## Phase 6 — Account, team, and onboarding

1. Apply the shared design to sign-in/signup, verification, password recovery, shop onboarding, profile, security, team, and activity.
2. Group settings by task; improve labels, help text, validation, pending states, and success feedback.
3. Make destructive actions clear and preserve confirmation and permission checks.

Testing: owner/admin/staff routes, expired sessions, shop changes, form errors, invitations, and MFA/session flows with dedicated test accounts. Check keyboard-only completion.
Exit: supporting screens match the main workspace and every existing workflow remains reachable.

## Phase 7 — Release hardening

1. Run the complete frontend checks and relevant backend regression checks for any API changes.
2. Exercise the real local frontend/API/database end to end. Review screenshots against the baseline for every route and key dialog state.
3. Validate in the available local browser. Cross-browser testing is excluded at the user’s request.
4. Verify 1280/1440/1920px desktop layouts, 768/390/320px fallbacks, 200% zoom, keyboard operation, focus, and contrast. Tables may scroll locally; pages should not overflow unintentionally.
5. Inspect console/network errors, loading behavior, repeat navigation, and catalogue performance. Verify A4/A5 PDF output; record physical printer testing separately.
6. Resolve critical/high bugs, document remaining lower-priority issues, and prepare a release checklist and rollback notes.

Exit: all required checks pass; no known critical/high correctness, access, or workflow defects remain; visual and browser evidence plus any limits are recorded. Deployment is a separate release action.

## Working method for every implementation phase

- Deliver a complete, reviewable workflow at a time. Run targeted checks during work and the relevant regression suite before declaring the phase done.
- Reproduce bugs, fix their cause, and add meaningful regression coverage for behavior at risk. Do not write tests that merely restate CSS choices.
- Preserve existing fixes and unrelated local edits. Keep UI changes and necessary business-logic fixes understandable in review.
- Record what changed, what was tested, screenshots, remaining bugs, and any blocked verification.
- Prefer existing React, router, query, API-client, and native dialog patterns. Add dependencies only when a concrete need justifies them.
- Defer dark mode, new modules, global search infrastructure, and backend redesign unless separately requested; the immediate priority is quality and simplicity of existing desktop workflows.

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Testing and bug fixing happen throughout, not only in Phase 7.

## Implementation checkpoint — 28 October 2026

First milestone implemented: desktop sidebar with icons, shop/account context,
page breadcrumb header, wider workspace, refined shared typography/table styling,
and Products heading, filter toolbar, result count, and clear-filter action.
Category query failures now show feedback and a retry control.

Validation: 67 frontend tests passed (including new clear-filter and category-retry
coverage), lint clean, TypeScript and production build passed in the project Docker
runtime. The host Node binary is unusable because its simdjson library is missing;
no system installation was changed. `git diff --check` passed.

Real local browser: verified the catalogue at 1440px, low-stock filtering,
filter reset, and product-detail navigation. At 390px verified page width stays
390px and the menu hides/opens correctly after fixing a CSS cascade regression.
Desktop screenshot: `docs/desktop-catalogue.png`.

This is the shell/Products foundation milestone. The full workflow audit,
remaining Products refinements, home/reports, billing, account screens, cross-browser
coverage, accessibility audit, and release hardening remain in the phased plan.

## Home and Reports checkpoint — 28 October 2026

Implemented the operational home page using existing server KPI data for owners
and admins, with a separate task-focused staff view that never requests reports.
Added daily sales/collections, outstanding payments, stock value, low-stock link,
create-bill shortcut, daily tools, and account links. Refined all report navigation,
report descriptions, period toolbar, KPI cards and chart layouts. Report failures
now offer a retry action without changing the selected dates.

Validation: 70 frontend tests passed, including owner dashboard figures, staff
request restrictions, and report retry/date retention. Lint and TypeScript/production
build passed. Live browser checked home figures, home-to-report navigation, switching
the period to Last 7 days and retaining it when switching to Profit and loss.
Home, report overview, and Profit and loss had no page overflow at 390px.
Browser warning/error log was empty. Desktop screenshots saved in
`docs/desktop-home.png` and `docs/desktop-reports.png`.

This checkpoint does not replace the planned full eight-report state/export sweep,
cross-browser/accessibility checks, or final release verification. Billing and
supporting account/onboarding redesigns remain next.

## Billing checkpoint — 28 October 2026

Implemented a desktop cart/summary workspace, sticky payment panel, empty cart
feedback, expandable tax/address fields (expanded for business bills), prominent
total, and payment amount limit based on the server preview. Bill history now has
payment status badges and a clear-filter action. Bill details use a table with a
separate totals panel and a prominent Record payment action.

Fixed a save/retry inconsistency: a 409 `idempotency_conflict` now preserves the
frozen request/key and keeps the cart locked, matching payment/return behavior.
Other validation conflicts continue to unlock the cart for correction.

Validation: full frontend suite, lint, TypeScript, and production build run in
Docker. Added regression coverage for idempotency conflict, filter reset and B2B
tax disclosure. Live browser verified one/two-item quantity pricing, B2B tax-field
expansion, bill status filtering/reset, existing bill details and A4/A5 invoice
screen previews. Checkout, list, details and invoice had no page overflow at 390px.
Browser warning/error log was empty. Screenshot: `docs/desktop-billing.png`.

Save/payment/return retry paths were exercised with test API fixtures; no new live
invoice or payment was saved in this checkpoint. Actual PDF/physical printer output,
full tax/discount matrices and cross-browser checks remain release validation work.

## Account and team checkpoint — 28 October 2026

Implemented shared Profile/Security tabs, grouped settings cards, clearer account
help text, a distinct account-deletion section, responsive team/member/invitation
layout, role explanations, and shared authentication-page styling. Onboarding and
shop activity now follow the page hierarchy. Account deletion retains a compact,
focused form layout.

Fixed missing loading/error states on team invitations; failures now show a retry
action. Successful invitations show confirmation. Added retry controls for team,
onboarding invitations, MFA status, sessions, and activity query failures.

Validation: 76 frontend tests passed; lint, TypeScript, production build and
`git diff --check` passed. New tests cover invitation failures/retry, invitation
success and payload, and profile save/account navigation. Browser inspected
Profile, Security and Team; all three stayed within 390px page width. Inspected
the shared authentication layout via the public account page. No warning/error
entries were present at the final browser log check. Screenshots:
`docs/desktop-profile.png`, `docs/desktop-team.png`.

Live password/email/MFA changes, invitations and role changes were not submitted.
Onboarding and sign-in flows remain covered by the existing automated suite;
full real-browser credential, email delivery and new-shop journeys, cross-browser
coverage, accessibility verification and release hardening remain outstanding.

## Release hardening checkpoint — 28 October 2026

See `RELEASE_HARDENING.md` for the final local checks, bug ledger, evidence and
release-sign-off gaps. Fixed shop-crossing placeholder data and product UI state,
and verified modal focus restoration after Escape. Frontend: 81 tests plus lint,
TypeScript and production build passed. API: 229 unit + 187 integration tests passed.
Forty live route/viewport checks passed. Applied the explicitly approved password
strength threshold of 2 and verified varied eight-character acceptance.

Local implementation is ready for review. Cross-browser, full accessibility,
printed-output, large-catalogue and production validation remain pending; this
checkpoint is not a production-readiness certification.


## Additional local UI validation — 28 October 2026

Cross-browser testing has been removed from scope at the user's request.

Completed live checks: product editor at 320px (286px dialog within the viewport),
first-field focus, Escape closing and focus restoration; category/unit dialog;
CSV dry-run preview with one valid and one invalid row (error on row 3); label
preview with a valid barcode and a missing-code warning; negative stock-quantity
validation. Product CSV values were reconciled against all three visible synthetic
catalogue records using exact Decimal comparisons. This dry run added no products.

Fixed import confirmation not entering busy state (including repeated submissions),
silent label-load failures, and missing category/unit error/retry feedback. Disabled
label printing when selected products cannot all be loaded. Amber text contrast was
3.68:1 on white and 3.44:1 on the workspace background; now 5.42:1 and 5.06:1.

Final checks: 84 frontend tests passed; lint, TypeScript, production build and
whitespace checks passed. The added tests cover import double clicks/pending locks,
label-load failures/printing prevention, invalid stock quantities and preserving
input after server rejection. Product-editor DOM inspection found no unlabelled
inputs/selects or unnamed buttons.

Limits: actual browser zoom did not respond to the exposed keyboard shortcut,
so true 200% zoom remains unverified. No screen-reader or physical-printer control
is available here. Printed A4/A5 output, full screen-reader operation, large real
catalogue timing and production smoke testing are still separate validations.
Native dialog tabbing can move focus to browser chrome at the cycle boundary;
Escape and opener restoration were verified. No full accessibility certification
is claimed. Raw summary: `product-validation-results.json`.


## Final code refinements — 28 October 2026

All five requested code follow-ups are implemented:

- Product forms: Details, Pricing and Stock fieldsets, with optional identifiers/tax
  in a disclosure. All existing input values remain in the save payload.
- Secondary actions: Products exposes Add, Import and Print labels directly; exports
  and category/unit management live under More actions. Escape and outside clicks
  close the disclosure; ordinary buttons remain keyboard-reachable.
- Details/history: prominent selling price and stock summary, compact facts and a
  clearer history layout with signed quantities and readable timestamps.
- Shared UI: Button, PageHeader, Toolbar, FormSection and ActionMenu in
  `src/components/workspace.tsx`, with component styles in `workspace.css`.
  Main workspace headers and product/billing filter toolbars use the shared
  components. Existing Alert/Loading/Empty components share this stylesheet.
- Pending operations: product and stock forms disable inputs, Cancel and Close,
  reject repeated submissions and prevent Escape dismissal while saving.
  Category/unit management also locks both sections and closing while a write runs.

Validation: 89 frontend tests passed, lint/TypeScript/production build passed,
`git diff --check` passed. Added pending-product/stock/category tests, cancel-event
prevention, action-disclosure checks and a complete grouped-form payload test.
Browser verified native action visibility, Escape/outside dismissal, expanded form
and detail-panel fit at 320px; Billing/Profile remained within 320px after shared
component adoption. Browser warning/error log was empty at the final check.
Screenshots: `product-form-final.png`, `product-details-final.png`.

This completes the five code items listed in the chat. Previously documented
limits for actual zoom, screen readers, printed output, real large-catalogue timing
and production smoke testing still apply. Cross-browser testing remains excluded.
