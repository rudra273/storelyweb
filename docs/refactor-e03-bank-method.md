# E03 D11 — bank method display compatibility

22 November 2026. Historical `bank` and `bank_transfer` both display as “Bank transfer” through the shared payment label helper. `bank_transfer` previously produced the same words through generic underscore formatting; this slice makes the identity explicit and adds regression coverage.

Inspected saved invoice payments, credit-note/refund invoice output, customer receivable payment history, expense history, purchase payment detail and supplier statement/ledger: all consume `components/labels.ts` for stored method labels. New sales/customer receipts/refunds emit `bank`; purchase/payment-terms/supplier forms emit `bank_transfer`, matching their existing endpoint DTOs. No endpoint enums, stored records, frozen request payloads or retry validators are rewritten by this change.

Coverage adds both historical spellings in saved invoice and supplier history, supplier new-payment wire value, shared label fallback behavior; existing billing and supplier suites retain frozen-retry regression coverage. This is the web display slice only; API/mobile alias handling and cross-client acceptance remain separately owned.

Verification: 138 tests passed across labels, billing and supplier suites; typecheck and lint passed. No browser/provider or production test performed for this display-only slice.
