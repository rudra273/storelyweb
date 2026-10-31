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

**Next up:** show the GST used in reports and the product panel (rest of item 11),
custom bill lines without a product, the standard invoice with a settings editor
and live preview, then Phase 4 polish.

## Phase 2: missing features customers expect (Android has them)

6. **Shop and invoice settings.** No web page to set shop address, phone,
   GSTIN/GST scheme, invoice series, round-off, default GST. The invoice prints
   only the shop name. [web] Settings page using `/shops/{id}` and
   `/invoice-settings`; [api] add whatever is missing.
7. **Invoice content.** Always says "TAX INVOICE" even for an unregistered shop
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

11. **Cost includes a hidden 18% GST.** Unregistered shop, product GST not set:
    cost ₹8 becomes ₹9.44 in reports, so a ₹10 sale shows ₹0.56 gross profit and
    stock at cost ₹689.12 for 73 × ₹8. This follows the Android pricing rule
    (`billing_math.resolve_price`: default GST 18%, purchase GST is a cost when
    unregistered) but the web never says so: the product shows GST "—" and the
    cost field doesn't say "before GST". [decide] keep the rule? Then [web] show
    the GST rate actually used (incl. "default 18%") and "landed cost" on the
    product, and label the cost field.
12. **Tax report lists a sale under "18%" with ₹0 tax** for an unregistered shop.
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
16. **Stock labels.** 0 in stock shows "Low stock" instead of "Out of stock";
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
26. **Accessibility.** Low stock / Expiring filters are checkboxes named "on";
    sidebar "Cloud subscription" has no icon.

## How we will work

- Reproduce on the local stack (`make dev` + `make dev-seed`), never production.
- One item per change: fix, add or update a test, `tsc` + lint + tests green,
  then check it in the browser.
- [decide] items: agree the rule (check the Android app first) before coding.
- Any API change that needs a migration: run it on production with the release.
