# E01 web financial recovery slice

Date: 18 November 2026. This implements the local durable-send prerequisite for New invoice, plus generated API contracts. It does not complete all E01 infrastructure or other financial editors.

## Changed behavior

New invoice now synchronously persists and reads back the exact request body/key **before** sending it. A blocked/quota-limited browser store prevents the request. Unknown responses retain the request across reload and retry. Uncertain attempts no longer disappear after the ordinary seven-day draft expiration.

The invoice draft store retains the existing version-1 envelope and user/shop-scoped key. It compares the last observed serialized record before replacing/clearing it and reads back writes. A changed record from another tab fails closed until reload. Invalid envelope, oversized data, malformed critical draft fields or unreadable storage fails closed without deleting the possible operation. Compare/write/readback is best-effort detection, not an atomic localStorage compare-and-swap guarantee for simultaneous writers.

Known validation rejection (422) and explicitly classified safe 409 domain rejections allow correction only after clearing the persisted attempt succeeds. Unknown 409/request conflict stays frozen. On a successful server save with failed browser cleanup, the completed invoice stays visible; starting another invoice requires successful draft cleanup. Error text distinguishes an unsent current attempt from any previously unconfirmed request.

Existing explicit sign-out still clears drafts for privacy. This slice does not promise recovery after explicit sign-out, browser storage deletion, another device, or inaccessible/corrupt storage. No tokens are added to browser storage and no historical money values are rewritten. UI theme and checkout sequence are retained.

## Files

- `src/billing/checkout/invoiceDraftStore.ts`: production-used guarded invoice draft persistence.
- `src/billing/NewBill.tsx`: synchronous send guard, safe recovery validation and completion cleanup gate.
- `src/billing/Billing.test.tsx`, `checkout/invoiceDraftStore.test.ts`: durability, malformed/old recovery, blocked writes, cross-tab conflict, pre-network persistence, exact retry and cleanup-failure regressions.
- `openapi.json`, `src/api/schema.d.ts`: regenerated from API E01 typed operation metadata. Generation also brings previously stale audit DTOs/routes and schema default annotations into alignment with the current API; these are generated changes, not hand-authored client contracts. Existing operations remain compatible; this slice safely retries the original billing request rather than adding a new lookup-based UI flow.
- `e2e/invoice-recovery.cjs`: real localhost recovery scenario using an explicitly supplied isolated premium shop.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: **passed**. Full suite **363 tests / 40 files**, exit 0. Existing jsdom document-navigation notices and large bundle warning (770.44 KB JS) remain.
- Focused invoice/store suite passed before final cleanup test; final full suite includes all regressions.
- Real current-source Vite browser + Docker API/Mailpit: **passed**. Injected quota failure caused zero bill POSTs; persisted body/key existed before the first network call; API committed an invoice and response was deliberately lost; reload/retry reused identical request/key and stock decreased exactly once. Output at `/tmp/storely-e01-web-recovery.log`. The coordinator owns removal of the exact fixture shop/account.
- Generated types: API `make openapi` by coordinator, web `make api-types` succeeded.

Browser command requires `STORELY_FIXTURE` pointing to a run-owned JSON file with email/password/shop_id/product_uuid, an existing Playwright runtime via `PLAYWRIGHT_MODULE` if needed, and optionally `CHROME_EXECUTABLE`. It refuses non-local origins and never prints credentials. It deliberately creates one invoice in that isolated fixture; cleanup belongs to the fixture owner, not a broad data reset.

## Remaining E01 work

Generic durable job/outbox infrastructure, server-side command normalization/posting adapters, broader mobile/web workflow parity, financial editors beyond New invoice, and atomic cross-tab ownership transfer are not implemented by this slice. E01 remains partial until its other vertical slices pass their gates.
