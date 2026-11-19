# E02.1 web settlement and reviewed calculation

New invoices require an explicit full, partial or unpaid choice. Partial amounts are compared as exact integer minor units and must be positive, below the reviewed total, at most two decimal places and within the API payment maximum. Blank, malformed, negative, zero, equal, excess and overprecision input remains visible when refused; no amount is clamped or silently changed.

Changing customer details/type or any payment detail clears unassigned-balance consent. A new authoritative preview, including a settings-only reviewed-context change with the same total, clears the settlement selection and consent while keeping entered amount, method and reference. The existing tabs, layout and theme remain unchanged.

Every fresh request requires the server's `br1:<64 lowercase hex>` reviewed context and sends it with `settlement_choice` (`full`, `partial`, `unpaid`). Missing or unsupported tokens fail closed before draft freezing or network creation. The API checks that context atomically against the calculation/settings snapshot; browser validation alone does not close the preview-to-commit race.

A first fresh `checkout_changed` rejection can release the exact rejected attempt only after durable storage succeeds. It refreshes the preview and requires settlement/consent selection again, retaining other fields. A previously uncertain or restored operation remains frozen after that same response and retains its original body/key. Legacy uncertain bodies without the new paired fields retry unchanged and do not need a fresh preview. Existing E01 storage-before-send and cross-tab protections remain in force.

The next invoice after successful completion starts with settlement unselected. There is currently no web duplicate-sale action to carry a prior settlement. A full persisted checkout lifecycle, held drafts and duplicate-sale workflow remain E02.2 scope; this slice does not claim completion of E02 or human UX acceptance.

Verification: typecheck, lint, all **450 tests across 44 files**, and production build passed. The focused checkout/settlement suite passed 83 tests before the final settings-only token regression, which passed in the full suite. Existing jsdom document-navigation notices and the 786.28 KB bundle warning remain. Local full-suite/build log: `/tmp/storely-web-e02-full.log`. Coordinator-owned localhost/Docker browser pairing remains pending and will be recorded separately. Generated OpenAPI/types come from the API lane's frozen contract; no manual wire types were introduced.
