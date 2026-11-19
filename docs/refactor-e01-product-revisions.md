# Product revision and capability consumption

19 November 2026. The full and inline editors now freeze the original fields and updated_at token together. Background refetches can update the surrounding list without advancing the open editor's token or making untouched remote fields appear locally edited. The API's atomic expected_updated_at check detects a stale product.

A conflict retains all entered fields and blocks another save until the user explicitly reviews the latest product. The review shows latest/local values for edited fields, then reapplies only the local changes onto that latest snapshot. Unrelated remote changes are preserved. Incompatible pricing/stock-mode changes in inline editing require review in the full editor. Existing theme components are reused.

Fresh `/capabilities` metadata validates the service contract and tenant before guarded edits. Metadata never grants permission; PATCH checks current role/premium/tenant on the server. Older missing routes preserve existing expected_updated_at behavior; tenant-concealing 404, malformed/future contracts and transport errors block the write and retain input. Generated API schemas include the new capabilities and backend job DTOs.

Validation: 391 tests across 42 files, typecheck/lint/build pass; coordinator reruns recorded centrally. Actual localhost `e2e/product-revision.cjs` passed inline/full stale rejection, retained values, explicit dirty-only rebase and remote-field preservation against an isolated premium product. The concurrent API test holds the real row lock and proves one 200/one 409 with one audit; its negative control reproduced the previous two-success overwrite.

Scope: product edits only. Settings still aggregate multiple rows and legacy sync writers; settings revision/rebase needs a separate contract. This slice does not claim all mobile/web flow parity or replace human acceptance.
