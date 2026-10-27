# Local UI audit — 28 October 2026

Tested the running HTTPS frontend and real local API/PostgreSQL through the
in-app browser, using a separate **UI Audit Store** and synthetic customer,
product, stock, and invoice data. Existing shop data was not edited.

## Findings fixed

| Finding | Fix and verification |
|---|---|
| Web catalogue price differed from invoice price | Explicit catalogue prices now populate the manual price and direct-pricing flag used by billing and mobile sync. Created a product at ₹125.50 with ₹98 cost; two units now preview and save at ₹251.00. The previous flow billed at ₹115.64/unit. Added backend integration coverage for creation, editing, and sync, plus zero/omitted/cleared-price cases. |
| Team table widened the page and clipped the mobile menu | Constrained the shell content track and wrapped Team, security-event, and shop-activity tables in local scroll containers. |
| Selecting a product widened the mobile page | Fixed the detail-panel grid's minimum width and constrained its facts columns. Verified a 358px panel inside a 390px viewport, with page width remaining 390px. |
| Mobile product search shrank to a tiny field | Search now occupies a full filter row at narrow widths. |
| Short pages stretched the mobile header | Set explicit header/content grid rows so spare height belongs to the content. |
| Billing selects ran into their labels | Applied consistent stacked label/select spacing. |
| Invoice amounts broke across several lines on phones | Invoice item tables now scroll horizontally on screen while numeric cells stay intact. Print overflow remains visible; the screen-only minimum width does not apply in print. |
| Modal opening focused Close instead of its form | Focus now moves to the first enabled field after opening. Verified Product name focus and Escape closing in the real browser. |
| Products without a code showed duplicate separators in billing | Omitted empty product-picker segments. |

## Browser coverage

- Signup, mismatched-password error, email verification through local Mailpit,
  sign-in, shop onboarding, and session persistence during navigation.
- Product creation, invalid numeric input, long names, detail panel, stock history,
  insufficient-stock error, search, selection, label preview and missing-code hint.
- CSV import preview with one valid and one invalid row, row-specific feedback,
  successful import, and product CSV export.
- Bill creation, server preview, saved invoice price, partial payment, A4/A5 paper
  selector, and phone invoice preview.
- Profile name save and success feedback; security/session controls inspected.
- All eight report views: overview, day book, profit and loss, receivables,
  expiring stock, purchases, tax/GSTR-1, and stock value. Excel download succeeded.
- Team and shop activity layouts; mobile menu opening/navigation/collapse.
- No browser warning/error log entries in the inspected desktop or mobile tabs
  at the final console check.

Responsive checks:

| Width | Coverage |
|---|---|
| 1280px | Desktop forms, catalogue, billing, invoice, profile, security, reports |
| 768px | Home, products, new bill, Team, security, day book; no page overflow |
| 390px | All eight reports, product details, import/labels, dialogs, invoice |
| 320px | All 16 main/report routes; page width equalled viewport width with no unexpected alerts |

Tables may scroll **inside** their panels at phone widths. This is intentional.
The product-detail state and invoice state were separately checked because they
are not covered by a route-only layout sweep.

## Automated validation

- Backend: **227 unit tests + 187 integration tests = 414 passed**.
- Frontend: **65 tests passed**, lint and TypeScript checks passed.
- Backend formatting, lint, strict typing, and security scan completed successfully
  (the scan still prints existing suppression/comment warnings).
- The updated frontend was built and served locally for the browser rechecks.
- `git diff --check` passed in both repositories.

## Evidence and limits

Screenshots and viewport result JSON are saved in:

`/Users/rudra/.codex/visualizations/2026/10/27/01a17e7a-639c-7831-ac13-1cd1cd2ec0ca/storely-ui-audit/`

The local test shop/data remains available for review. Earlier incorrect test
invoices retain their original snapshots; the corrected invoice is
**INV/2627/0002** in UI Audit Store.

This pass is browser testing with simulated viewport sizes, not physical-device
or Safari/Firefox coverage. Password/MFA credential changes, destructive account
deletion, and staff-role changes were not manually performed in this pass; related
backend tests passed. Real printer/PDF output and production Render/Vercel/Postmark
behavior still need separate checks. No claim is made that every possible input
or failure state is covered.
