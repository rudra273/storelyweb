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

## Follow-up: exclusive cross-tab persistence

New invoice now acquires the browser's Web Lock for its origin/user/shop-scoped draft key before every store mutation. The serialized-record comparison happens inside that exclusive callback. Callbacks perform storage work only; they do not hold a lock while awaiting network responses. Two participating tabs starting from the same prior record can no longer both persist distinct financial operations. Uncertain retries may share the same already-frozen request; server idempotency protects network overlap.

There is no application lease/expiry timer. The browser releases the lock after the callback completes or its owning context closes. Browsers without Web Locks, insecure contexts or denied lock requests fail closed with actionable feedback; no invoice is sent using an unsafe compare/write fallback. A tab running an older application version that ignores this protocol is outside the guarantee, so coordinated client rollout remains required.

A queued stale autosave cannot strip a frozen request. Only explicit definitive rejection or successful completion permits release. Checkout fields/save controls are locked while preparing persistence. User/shop identity is part of the mounted form key; leaving checkout before a queued write runs cancels that write and prevents sending from the old screen. An active-owner check inside the lock prevents a queued task from repopulating browser drafts after sign-out. If the request was already persisted before the screen closes, its frozen identity remains recoverable. Explicit sign-out still clears drafts under the existing privacy policy.

Verification: typecheck/lint passed; full suite **370 tests / 40 files passed**, with focused checkout/store **56 passed** after final waiting-state UI handling. Production build passes (existing bundle-size warning). Real two-tab browser test (`e2e/invoice-locks.cjs`) passed: both writers queued behind one owner, exactly one operation won, and closing a lock owner released its lock automatically. Existing real API recovery browser scenario also passed with asynchronous locking: blocked storage never sent, committed/lost-response reload reused exact body/key, and stock changed once. Logs: `/tmp/storely-e01-web-locks.log` and `/tmp/storely-e01-web-recovery-locks.log`. Root cleaned the run-owned paid fixture; no real business data was used.

The earlier best-effort compare/write limitation above is superseded for cooperating current-version New invoice tabs by Web Locks. Generic durable background jobs, cross-device ownership transfer, and other financial editors remain out of scope for this follow-up.

## Slice 3 — supplier payment durability (19 November 2026)

Supplier payments now use the shared browser financial-storage lock, exact readback and owner snapshot comparison before any POST. Existing raw saved request bodies remain readable, including purchase-scoped legacy keys. All unresolved keys for the supplier are inspected together; malformed or multiple requests block another payment rather than silently disappear. Reopening through a different purchase or general supplier action preserves and displays the original selected target and exact request.

Unknown outcomes and permission/intent conflicts stay frozen. A restored request also stays frozen after a later 422, since it may have committed before validation rules changed. Only first-send validation rejection can clear the attempt. Explicit signout clears supplier operation drafts under the existing privacy policy; lifetime guards stop queued writes from recreating them. Legacy-intent conflicts direct inspection of the original statement without creating a fresh payment key.

Validation: 382 web tests across 41 files, typecheck, lint and production build passed. Real localhost `e2e/supplier-payment-recovery.cjs` passed with a run-owned premium shop, supplier and two unpaid purchases: storage failure sent no POST; the selected-purchase payment committed with its response deliberately lost; general-account reopen retained the exact selected body/key; retry produced one payment allocated solely to the original target. Existing invoice recovery and two-tab lock scenarios were rerun after shared-helper extraction; coordinator records final outcomes. Generated OpenAPI/types include the exact-body recovery endpoint. Production bundle size warning remains; no theme changes were made.
