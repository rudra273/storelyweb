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

This stage records received stock for existing tracked products through the stage-2 API.
It shows a stock-cost subtotal and explicit Payment: Not recorded. It does not claim a
final tax invoice total or supplier payable. New product creation inside a purchase,
purchase-file import, payments, tax/discount/freight totals, attachments, returns,
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
