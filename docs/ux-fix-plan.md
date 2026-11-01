# Web UX and bug fix plan

From a customer walk-through of the local stack on 1 Nov 2026 (owner account, new
"Dev Shop"): add products, categories and units, adjust stock, add a purchase,
create a bill, print the invoice, every report tab, team, activity, account and
subscription. Fix one item at a time, smallest risk first inside each phase.
Each item says where it was seen and the likely place to fix it.

Legend: **[web]** storelyweb, **[api]** storelyapi, **[decide]** needs your call first.

## Decisions (1 Nov 2026)

- **Price mode toggle:** each product either has a set selling price, or a price
  calculated from cost + margin (the Android `direct_price_toggle`). The form
  shows the choice; the calculated price is shown from the server, never guessed.
  Until the toggle lands, selling price is required.
- **Default units:** yes, every new shop gets common units.
- **Paid now:** no default. The cashier must enter an amount or choose
  Paid in full / Unpaid before the bill can be created.
- **No hidden GST:** every GST rate and cost that affects a price or report is
  shown (product, category, defaults), never applied silently.
- **Invoice:** a standard Indian GST invoice layout, with an invoice settings
  editor and live preview.
- **Billing:** remove the "I have checked the items and total" tick. Owners can
  bill items that are not in the catalogue (custom lines).
- **Category GST:** a category can carry an optional GST rate (and HSN), used by
  its products unless a product sets its own.
- Fix the remaining layout and alignment issues (Phase 4).

## Phase 1: blockers (customers cannot finish a task)

1. ✅ **Saving a product with an empty price crashes the server.** Name only →
   "Something went wrong on our side". Empty selling price or cost price is sent
   as `null`, which overrides the database default of 0 (`NotNullViolation`).
   - [api] `products.create_product`/`edit`: treat `null` as 0 for
     `selling_price`, `purchase_price` (or drop the key); return 422, never 500.
   - [web] `ProductForm`: omit empty money fields, or send `"0"`.
   - [decide] Should selling price be required? If yes, mark it * and say so inline.
2. ✅ **Errors in long dialogs are invisible.** The Add product error shows at the
   top of a scrolled dialog; the user sees nothing happen. [web] scroll the first
   error into view and show it next to the Save button too (all dialogs).
3. ✅ **No categories or units from the product form.** Both dropdowns say "None"
   with no way to add one; management is hidden under More actions →
   Categories & units. [web] "+ New category" / "+ New unit" inside the
   dropdowns (inline create, select the new one), like "Add supplier".
4. ✅ **A new shop has no units at all.** [decide] seed common units (pcs, kg, g,
   litre, ml, box, pack, dozen) on shop creation, matching the Android app's
   defaults. [api] or [web] onboarding.
5. ✅ **"Paid now" defaults to ₹0.** A normal cash sale is saved as unpaid unless the
   cashier types the total. [web] default to the bill total, with a
   "Paid in full / Part paid / Unpaid" choice. [decide] confirm with Android.

Also done with Phase 1: the billing tick is gone; the bill's items table shows
price and amount from the server; payment methods read Cash, UPI, Card, Bank
transfer, Online; categories can carry an optional GST rate.

✅ **Price mode toggle (2 Nov 2026):** "I set the selling price" or "Work it out
from cost + margin", with a live breakdown from the server
(`POST /products/price-preview`): cost, GST paid on purchase and where the rate
came from (product, category or shop default), overhead, margin, GST charged,
final price. The GST rate now sits in Pricing, not in the optional details.

✅ **GST shown everywhere it counts (2 Nov 2026):** the product panel shows how the
product is priced, the GST rate used and its source, and the price breakdown; 0
stock says "Out of stock". Stock value shows GST and cost per unit with a note;
profit and loss, the tax report and the stock-at-cost cards say when GST paid on
purchase is part of cost (shop not GST-registered). Items 11, 12 and 16 done.

✅ **Items not in the product list (2 Nov 2026):** owners and admins add a line
with name, price, quantity and an explicit GST rate (optional cost, HSN, unit). The
server prices it like any fixed-price line, moves no stock (as Android does), and
returns work on it. Staff are refused by the API and don't see the button.

✅ **Standard invoice and Shop settings (2 Nov 2026):** one invoice layout for the
bill page and the settings preview, following the phone's BillSettings switches
and title rule (Tax Invoice / Bill of Supply / Bill, composition note): shop and
customer blocks, place of supply with state name, intra/inter-state, columns by
switch, totals, amount in words, tax summary by HSN, payments, UPI QR for the
balance, bank details, terms, signatory, footer. Papers: A4, A5, 80 mm and 58 mm
receipts. Shop settings page (owner/admin): shop details, GST scheme, invoice
text, paper, round-off and every show/hide switch, with a live scaled preview.
Saved to the same synced rows as the phone (`PATCH /invoice-settings`); a newer
phone edit is reported (409) rather than silently lost. Items 6 and 7 done;
item 26 (subscription icon) done.

Not yet: shop logo and signature images (the phone stores them; the web does not
upload them yet), and customer pages (item 9), expenses (item 8).

✅ **Phase 4 polish (2 Nov 2026):** shared labels for dates,
payment status/method, roles, stock reasons and bill history; report period range;
"Saved" toasts for product, stock, bill, payment, return and cancel; Get started
card on Home and empty-catalogue actions; subscription badge fixed and request link
hidden when active; stock problems shown by the items; Adjust stock starts on
"Stock came in" at zero; compact purchase footer; dialogs open near the top;
import sample CSV and plain-language help; activity, account and session labels.

✅ **Customers and expenses (1 Nov 2026):** Customers page (everyone in the shop): the
list with what each customer owes, most owed first, search by name, phone or GSTIN,
"only customers who owe"; a customer page with bills, payments and details; add and
edit (name and a unique phone required, as on the phone); "Record payment" puts one
payment against the unpaid bills oldest first (the phone's rule), safe to retry.
Expenses page (owner/admin): month and category filter, totals, cash total, add, edit,
delete; amount above zero, date not in the future. Both write the synced rows the phone
uses (no migration); a newer phone edit is reported, not overwritten. Profit and loss
already counts expenses. Items 8 and 9 done.

✅ **Validations (1 Nov 2026):** shared checks for phone, GSTIN, email, UPI id and
amounts (`src/lib/validate.ts`), shown next to the field with focus on the first
mistake. New bill no longer sends a half-typed GSTIN to the price check (it used to
say "change the quantity"), checks the phone, and picks place of supply from a list.
Shop settings check phone, email, GSTIN and UPI id (the API now also refuses a bad
shop phone or email). Browser checks everywhere are worded like our own messages
("Amount is required."). Bill payment methods show their names.

✅ **Logo and signature (1 Nov 2026):** Shop settings pick a logo and a signature
(PNG, JPG, WebP or GIF; large pictures are shrunk to fit 400 KB, the phone's limit),
preview them on the invoice, remove them, and switch them on or off. Stored as plain
base64 in the same `bill_settings` columns the phone fills and prints, so both sides
show the same pictures. The API checks the picture type and size.

✅ **Get started card:** checked in the browser on a new empty shop (and by tests):
the three steps show, "Add your first product" opens the form, default units are there.

**Supplier payments and purchase tax (10): implemented locally; see the validation section below.** Original approved scope: Neither the phone nor the API
records these yet: purchase documents are immutable and `payment_status` is fixed to
`not_recorded` by a database check; the phone's plan lists them as PAY-01 and PUR-02.
Approved implementation scope:

1. [api] Migration: `supplier_payments` (supplier, date, amount, method, reference,
   notes) and `supplier_payment_allocations` (payment → purchase, amount), plus
   per-purchase `tax_amount`, `charges_amount`, `discount_amount`, `total` and
   `due_date`, and `payment_status` widened to not_recorded / unpaid / partial / paid.
   Purchases already saved stay "Not recorded" (never shown as owed).
2. [api] Endpoints: record a payment against one supplier's purchases (oldest first,
   like customer payments), supplier list with what you owe, supplier statement.
3. [web] Purchase form: GST and other charges per purchase, "Paid now" choice like
   bills; Suppliers page with dues and Record payment; purchase detail shows payments.
4. [android] The phone needs a matching update to see and record these (whole-document
   sync, as purchase receipts use today). Until then, payments made on the web do not
   show on phones.
5. Run the migration on production with the release, as before.

## Phase 2: missing features customers expect (Android has them)

6. ✅ **Shop and invoice settings.** No web page to set shop address, phone,
   GSTIN/GST scheme, invoice series, round-off, default GST. The invoice prints
   only the shop name. [web] Settings page using `/shops/{id}` and
   `/invoice-settings`; [api] add whatever is missing.
7. ✅ **Invoice content.** Always says "TAX INVOICE" even for an unregistered shop
   (should be "Bill of Supply"/"Invoice"), no address/GSTIN/phone, no amount in
   words, no thermal (58/80 mm) size. [web] `Invoice.tsx`, paper CSS. [decide]
   match Android's invoice layout.
8. **Expenses.** Reports show Expenses and Net profit, but expenses can only be
   entered on Android. [api] endpoints + [web] Expenses page.
9. **Customers.** No customer list, balances or history on web (only a search
   while billing). [api] + [web] Customers page with dues and payments.
10. **Supplier payments and purchase tax.** Purchases say "Payment, tax and
    additional charges are not recorded here". [decide] scope vs Android.

## Phase 3: confusing numbers (money shown without explanation)

11. ✅ **Cost includes a hidden 18% GST.** Unregistered shop, product GST not set:
    cost ₹8 becomes ₹9.44 in reports, so a ₹10 sale shows ₹0.56 gross profit and
    stock at cost ₹689.12 for 73 × ₹8. This follows the Android pricing rule
    (`billing_math.resolve_price`: default GST 18%, purchase GST is a cost when
    unregistered) but the web never says so: the product shows GST "—" and the
    cost field doesn't say "before GST". [decide] keep the rule? Then [web] show
    the GST rate actually used (incl. "default 18%") and "landed cost" on the
    product, and label the cost field.
12. ✅ **Tax report lists a sale under "18%" with ₹0 tax** for an unregistered shop.
    [web] explain "not GST-registered: no tax charged" or hide rates.
13. **Report period shows one date** ("2026-11-01") for "This month". [web] show
    the range, e.g. "1–30 Nov 2026".

## Phase 4: polish (looks unfinished)

14. **Raw values on screen.** Dates as `2026-11-01` (bill header, payments,
    purchase receipt, report tables) vs "1 Nov 2026" elsewhere; lowercase codes:
    "paid", "cash"/"upi" in the payment method list, "owner"/"staff"/"admin",
    stock history "Adjusted · count". [web] one formatter for dates, statuses,
    payment methods, roles and adjustment reasons.
15. **"Premium is active active"** duplicated word on Cloud subscription; the page
    still offers "Request Premium from the web" while Premium is active.
16. ✅ **Stock labels.** 0 in stock shows "Low stock" instead of "Out of stock";
    product panel doesn't show the unit or GST rate used.
17. **Billing screen.** Items table has no price or line total; the "Not enough
    stock" message appears in the summary (not by the quantity) with a useless
    "Retry pricing" link; the "I have checked the items and total" tick on every
    bill slows cashiers ([decide] keep?).
18. **Adjust stock** opens on "Stock went out / Damaged" even at 0 stock; default
    to "Stock came in" when stock is 0 or ask first.
19. **Purchase dialog.** Line quantity/cost fields sit in a tiny inner scroll
    area; purchase time shows "12:00" though no time was entered.
20. **No success feedback.** Saving a product, edit or bill gives no "Saved"
    message. [web] small toast.
21. **Empty states.** New shop Home shows ₹0 cards with no "Add your first
    product" guide; empty Products list has no buttons; "Add purchase" is the
    primary button even with no products.
22. **Categories & units dialog** grows and moves the Add buttons while typing.
23. **Import** has no sample file and lists technical column names
    (`product_name`); **Print labels** is disabled with a faint hint far away.
24. **Shop activity** says it shows sign-ins, but sign-ins are not listed; only
    "shop created" appears. [api] log sign-ins, or [web] fix the description.
25. **Account.** "Your password" label under Change email is unclear; session list
    mixes "Web browser" and "web" labels.
26. ✅ **Accessibility.** Low stock / Expiring filters are checkboxes named "on";
    sidebar "Cloud subscription" has no icon.

## How we will work

- Reproduce on the local stack (`make dev` + `make dev-seed`), never production.
- One item per change: fix, add or update a test, `tsc` + lint + tests green,
  then check it in the browser.
- [decide] items: agree the rule (check the Android app first) before coding.
- Any API change that needs a migration: run it on production with the release.

## Supplier accounting implementation in progress (1 Nov 2026)

Migration 0018 adds payment headers/allocations and explicit purchase financial
amounts. Existing receipts retain Not recorded and no inferred payable balance.
The API calculates totals, serializes payment allocation under the shop receipt
lock, rejects overpayments, and replays identical payment requests safely.
Supplier statements and purchase details expose exact decimal amounts. A payment
advances each affected receipt's change cursor so phones download its new state.

The web purchase composer accepts GST amount, charges, discount and explicit
supplier terms/due date. Suppliers → Statement and payments shows the balance,
purchases and payment history and records a payment. Uncertain requests retain
their original body/key in browser storage for retry. Android history now displays
downloaded financial details and payments; applying an update creates no stock.

The remaining payment work is now implemented: Paid now supports Unpaid / Part paid /
Paid in full, and full payment uses the server total. Inline payment is allocated
only to its new receipt, atomically with stock. The supplier directory displays
balances, sorts most owed first and filters to suppliers owed. Android schema 25
adds a durable supplier-payment queue, admin-only statement/entry UI, pending sync
counts, stable retry IDs and reconciliation against downloaded purchase payments.
An interrupted response replays the same request; a rejected payment is retained
for review and is never automatically re-submitted. Start fresh keeps unsent
payments local. Android can record payments offline against purchase balances
already downloaded to the device; new native stock receipts retain their existing
Not recorded terms until financial purchase entry is added to that composer.

Validation: real browser purchase → partial payment → directory dues → final
payment → receipt/stock/feed reconciliation (`e2e/supplier-payments.cjs`); real
Android SQLite/sync engine → TLS API/PostgreSQL → web-side payment → second-device
restore (`test/supplier_payments_live_test.dart`); native Android emulator screen
entry and SQLite reopen (`integration_test/supplier_payments_on_device_test.dart`).
API integration coverage includes allocation, concurrent overpayment prevention,
request retries/conflicts, unknown terms, access denial and paid-now targeting.
No production migration or release has been performed.
