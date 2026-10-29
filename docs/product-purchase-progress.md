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
