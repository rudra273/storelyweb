# Web purchase composer — stage 3

## Entry points

- Products → Add purchase opens a recoverable receipt draft.
- Product details → Restock preselects that tracked product when the current draft is empty.
- Products → More actions → Purchase history lists new receipt documents. Older movements remain in Reports → Purchases.

The form supports editable receipt date, optional supplier and inline supplier creation,
existing tracked-product search by name/code/barcode with paging, fractional quantities,
unit costs, separate rows for distinct lots/costs, batch/expiry, invoice reference and notes.
New rows focus quantity. The sticky subtotal/save area adapts to narrow screens.
Successful confirmation displays the saved immutable receipt snapshot.

All financial calculations use scaled BigInt arithmetic. Each line rounds half-up to
cents, matching the API; subtotal adds the rounded line amounts. Receipt money display
preserves exact large amounts and up to four decimal places for unit costs.

## Recovery and retry rules

Drafts are stored in localStorage under account + shop IDs, never under a shared global
key. They remain on this browser after closing/reloading, and are not cross-device drafts.
Draft data includes product names and purchase costs, but no authentication tokens.
Unreadable drafts are preserved and block posting until explicitly resolved/discarded.
Blocked storage prevents confirmation until the request can be persisted durably.

Before POST, the exact payload and stable request_key are persisted and frozen. Network
failures, server failures, timeouts and request-key conflicts retain that frozen request;
Retry purchase sends identical content. Definitive validation rejections permit editing without inventing another request key.
Access rejections after an earlier uncertain send keep the request frozen because the
receipt may already have been saved before access changed. Discard is disabled for unresolved sends.
Offline confirmation sends no request and keeps the editable local draft.

Cross-tab storage changes block further editing/posting until the user closes/reopens.
Writes also compare the last stored draft before replacing it. A successful response
clears only its own unchanged stored draft, preserving newer changes from another tab.
The API remains the authority for idempotency and stock posting.

## Scope

The composer records received stock for existing tracked products or staged new products through the receipt API.
It shows a stock-cost subtotal and explicit Payment: Not recorded. It does not claim a
final tax invoice total or supplier payable. Payments, tax/discount/freight totals, attachments, returns,
advanced filters and native Android purchase-document sync remain later stages.

The shared Modal component was also fixed: queued native close events from React
StrictMode effect replay must not close a reopened dialog, and nested dialog events
must not close their parent. Native Escape now delegates to the guarded close callback.

## Validation

- All 139 web tests (20 files), TypeScript and lint pass.
- Production build passes (existing bundle-size advisory remains).
- New tests cover exact decimal math, shop-time date boundaries, account/shop draft
  isolation, corrupted storage, recovery, stable retries, inline supplier creation,
  validation, cross-tab conflicts, history, restock, staff visibility, blocked storage,
  offline confirmation and rapid duplicate submissions.
- Real Chromium with explicit API fixtures validates native nested dialogs, supplier
  creation, desktop/narrow rendering, item editing, reload recovery and identical retry
  payloads. Screenshots are generated under /tmp/storely-purchase-browser by default.
- API transaction semantics are covered separately by stage-2 real PostgreSQL tests;
  the browser fixture test does not claim a live API/database round trip.

Browser command (Playwright must be available):

```sh
node e2e/purchases.cjs
```

Serve the app at http://127.0.0.1:5175 first, or set PURCHASE_WEB_ORIGIN. Optional
PLAYWRIGHT_MODULE, CHROME_EXECUTABLE and PURCHASE_SCREENSHOTS configure local tooling.
No backend, remote deployment, or database migration is performed in this stage.


## Stage 4: staged products and files

New product opens a quick editor (name, quantity/cost, optional selling price and unit;
unit defaults to pcs). Codes, category and tax settings are expandable. Stage product
writes only the local draft. Edit new product updates metadata on every lot sharing
that staged identity. Add another lot preserves product identity and keeps lot details
separate. The API creates the product and lookup names atomically with the receipt.

Import purchase file previews up to 200 rows from CSV/XLSX, with original row numbers,
matched/new identities, warnings and errors. Name-only matches require a selection;
invalid rows must be corrected in the file or explicitly excluded. Quantities/costs
remain editable in the parent draft, and new-product metadata uses the same staged
editor. No preview or staging action creates products or stock. Unit conversion is
not inferred: incompatible existing units are blocked/reviewed by the API.

Repeated files warn across dates and filenames and require explicit per-file approval.
The server rechecks at confirmation. A concurrent duplicate rejection can be resolved
by reviewing history and acknowledging source files in the retained draft. Source
fingerprints and row numbers survive edits/reloads and are recorded with stock.
Removing all rows from a source removes that source key from the confirmation.
Drafts support at most 200 items and 20 source files. Stage-3 drafts/retries remain valid.

Validation for this stage: all 143 web tests, TypeScript, lint and production build;
real Chromium staging fixture test with new products, explicit import matching/error
exclusion, narrow layout, reload and identical retry payload. Run with
PURCHASE_STAGING=1 to exercise it through e2e/purchases.cjs. API validation uses real
PostgreSQL separately (264 unit tests and 80 integration tests). Migration 0015 is
required before enabling these endpoints. No remote deployment is included.
