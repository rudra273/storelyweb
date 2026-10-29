# Product and purchase upgrade progress

## Stage 1 — web suppliers

Implemented supplier directory (Products → More actions → Suppliers), search, creation,
profile editing, preferred supplier selection on products, and inline supplier creation
without losing the product draft. Uses the existing owner/admin-only supplier API.
Fields obey API length limits. Failed saves retain entered data. Supplier mutations
refresh the shop-scoped query cache. This stage does not record purchases or dues.

Validation: 23 focused product/supplier tests, TypeScript, lint, production build.
Node 24 was used because the host's default Node executable has a missing dylib.
Dependencies restored using npm ci; lockfile preserved.

## Remaining stages

The end-to-end upgrade is NOT complete. Follow the master plan in the Android
repository at docs/product-purchase-implementation-plan.md. Next: shared durable
purchase documents and lines, atomic/idempotent confirmation, cost/date policies
and Android sync compatibility; then both purchase composers, drafts/imports,
payments, returns, reconciliation and advanced capabilities.

Existing unrelated changes in all three repositories must remain outside upgrade
commits. No deployment or database migration was performed in stage 1.

## Stage 3 — purchase composer and recovery

Added Add purchase, product-detail Restock, purchase history/detail, exact receipt
subtotals, supplier/date/lot entry, account+shop-scoped local drafts and frozen retry
payloads. Fixed shared native dialog event handling discovered by real browser checks.
All 139 web tests, TypeScript, lint, production build and desktop/narrow Chromium
fixture checks pass. See docs/purchase-composer.md for recovery rules and remaining scope.


## Stage 4 — staged new products and purchase-file imports

Added a local-only new-product editor with shared lot identities, recoverable metadata,
and atomic API creation at confirmation. Added read-only CSV/XLSX preview, explicit
name-match review and bad-row exclusion, preserved units/prices, original source-row
provenance and per-file duplicate acknowledgement across dates/filenames. Stage-3
request hashes and browser drafts remain compatible.

Validation: 143 web tests, typecheck/lint/build, real Chromium staging fixture checks;
264 API unit tests and 80 purchase/product/sync/report integration tests. API migration
0015 adds fingerprint history. Native Android document sync/composer parity and the
remaining payments/tax/returns work are still open.
