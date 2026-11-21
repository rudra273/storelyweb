# Storely web + API: production refactor plan

Audit date: 1 November 2026 (Asia/Kolkata). Scope: `storelyweb` and `storelyapi`. Android implementation is excluded; preserve existing API/data compatibility for its consumers. This document is a plan, not authorization to implement or deploy changes.

## 1. Product direction

Storely should feel like a dependable shop counter: find or scan an item, change quantity, take payment, print, and serve the next customer. Owners must also be able to receive stock, find unpaid bills, understand profit, and correct mistakes without guessing where a feature lives.

The main problem is not a lack of screens. It is the distance between the user's task and the controls needed to complete it, compounded by inconsistent editing, recovery and financial summaries. Refactor in vertical slices, retaining working money, stock and authorization rules. Do not replace everything in one rewrite or manufacture thousands of tickets to match the perceived size of the problem.

Priority order: trustworthy records → recoverable work → fast daily workflows → coherent visual system → secondary workflows → measured production readiness. Visual design begins early alongside correctness work; the client should see a coherent new checkout and catalogue before the entire backlog is finished.

### Explicit client/user requirements incorporated

- A visible scanner entry point on New invoice, including physical barcode scanner operation.
- A desktop split layout: **left = item search/scanning and bill lines; right = optional customer, totals, payment and completion**.
- Walk-in customer is the normal low-friction path. Customer information is optional for ordinary cash sales; required fields depend on the selected business/credit workflow.
- Discoverable editing of existing products and safe inline edits.
- Select all, clear selection, and explicit page-versus-all-results selection semantics.
- Consistent save/confirm actions, visible where users need them. This does not mean a confirmation popup for every click.
- Review layout across the whole application, not just billing.
- Barcode identifies a product; billing always resolves its current Storely selling price. Preserve existing package barcodes, generate an internal barcode for products without one, and support optional shop-label aliases for existing products.
- Users can print and reprint adhesive product barcode labels, individually or in bulk. Invoice printing supports A4, A5, 80 mm and 58 mm with consistent saved defaults and verified output.

## 2. Evidence and limits

### Environment

- Hosted `https://storely.rosmox.com/`: current signed-in account showed Premium onboarding, no available shop. Viewed only; no hosted business records created.
- Local `https://app.storely.localhost/`: existing owner workspace with two shops sharing the display name `abcd`. Used the already-selected shop for clearly named local audit records.
- Initial local tab was stale. Reload exposed newer Customers, Expenses, Shop settings, purchase and product-form features. Findings below use the refreshed UI unless explicitly described otherwise.
- Source reviewed: web commit `2eaee90`, API commit `566ac0b`. Running build identity was not independently proven equal to these commits. Add visible build metadata in the future.
- Desktop visual inspection at the normal browser size and 1280×720. Narrow navigation inspected at 390×844; viewport restored. This is not a full device/browser/accessibility certification.
- `npm test` in `storelyweb`: **25 test files, 174 tests passed**. jsdom printed “Not implemented: navigation to another Document”; these tests do not prove real navigation or printing.
- Docker status inspection was sandbox-denied. No API integration suite, load test, dependency audit, production restore, hardware scanner or physical print test was run. Existing API tests were inspected as source. Do not describe their presence as a passing run.
- No application source changed during the audit. No invitations sent, security settings changed, or production configuration altered.

### Hands-on workflow record

| Journey | Action and result | Implication |
|---|---|---|
| Product creation | Added `UX AUDIT Notebook 20261101`, sale ₹100, cost ₹60, opening 10, reorder 3, GST 0% | Basic create and opening stock work |
| Existing product | Opened product name → detail panel → Edit available | Editing exists but is hidden behind discovery and panel scrolling; inline editing absent |
| Stock validation | Tried selling 11 with 10 available | Server rejected with available stock and disabled save; retain this protection |
| Bill creation | Sold 2 to `UX AUDIT Walk-in`, no phone, total ₹200, paid ₹50 | Customer optional; invoice created with ₹150 due |
| Payment | Recorded remaining ₹150 | Bill became Paid; payment history appeared |
| Invoice | Opened print preview; A4/A5/80mm/58mm choices visible | Preview exists; actual printing/PDF export not tested |
| Return | Returned 1 with local audit reason | Credit note −₹100; stock became 9; no monetary preview before commit |
| Purchase | Restocked 5 at ₹60 plus ₹20 charges, no supplier/payment terms | Saved total ₹320; stock became 14; pre-save footer showed only ₹300 subtotal |
| Expense | Added ₹10 cash expense with `UX AUDIT local expense` note | Expense visible and report updated |
| Reports | Overview, profit/loss and day book | Net sales ₹100, cost of goods ₹60, gross profit ₹40, expenses ₹10, net profit ₹30; stock cost ₹840 |
| Draft recovery | Added item and customer to another unsaved bill → Products → browser Back | Cart and customer disappeared without a warning |
| Customer discovery | Opened Customers after named bill without phone | No customer created; matching is phone-dependent and disclosed in UI |
| Other screens | Team, shop activity, shop/invoice settings, responsive menu | Inspected without sending invitations or saving settings |

Local artifacts intentionally retained for traceability: product UUID `5a596109-05dd-4e3b-81f2-b45da234abd7`; invoice `INV/2627/0001` / `01a1980e-75ca-7441-8ec5-dbd50c99151b`; credit note `CN/2627/0001` / `01a1980f-0fcd-7190-aa55-6b2fb221d58b`; one five-unit purchase and one ₹10 expense. The extra draft was lost during the recovery test. No actual funds were transferred. Cleanup/reset belongs to the local demo-data workflow; do not silently erase history.

### Evidence labels

**UI** = observed in refreshed browser. **Code** = source-supported behavior, not necessarily reproduced at scale. **Proposal** = desired product behavior. **Verify** = an open investigation. Severity: P0 release blocker with confirmed critical impact; P1 correctness/data loss/core workflow; P2 daily usability; P3 polish or later capability. No production incident or security exploit is asserted by this audit.

## 3. Findings register

| ID | Priority / evidence | Finding and effect | Required outcome / phase |
|---|---|---|---|
| F01 | P1 UI + Code | Unsaved bill lost on route navigation/back. `src/billing/NewBill.tsx` stores cart/customer in component state. | Recoverable drafts and dirty-navigation protection; phases 1/3 |
| F02 | P1 Code | Bill attempt body/key survives only mounted UI. Reload after an uncertain write loses safe-retry context. Purchase drafts already persist frozen requests. | Persist operation identity separately from editable drafts; query operation status and reconcile before creating another bill; phases 1/3 |
| F03 | P1 Code | `app/domains/customers/customers.py:get_customer` reads latest 200 bills and calculates `due`/`due_bills` from that limited list. Older unpaid bills can vanish from detail totals although list aggregates include them. | Aggregate full ledger independently; paginate history. Reproduce with 201+ bills, oldest unpaid; phase 1 |
| F04 | P1 Code | `app/domains/customers/expenses.py:list_expenses` limits rows to 1,000 then calculates total/cash/category totals in Python. | Full filtered SQL aggregates plus paginated rows; test 1,001+ records; phase 1 |
| F05 | P1 UI | Return submits quantity/settlement without refund amount, returnable balance or stock-impact preview. Copy says “The server checks…” | Server-priced return review, clear settlement and stock disposition; phase 3 |
| F06 | P1 UI | Purchase shows stock subtotal before save; final total including charges appears after save. | Full pre-save total, amount paid/due and cost impact; phases 1/5 |
| F07 | P2 UI + Code | Checkout has only “Find product or barcode”; no visible scanner mode/action. Picker disables already-added product instead of incrementing. No dedicated scan handler in NewBill. | Keyboard-wedge scanner workflow, repeated scans increment, exact-code resolution and optional camera mode; phase 3 |
| F08 | P2 UI | Optional customer section consumes the top of checkout; at 1280×720 product results fall below the initial view. | Item-first split checkout agreed above; phase 3 |
| F09 | P2 UI + Code | Product header has selection label but no select-all checkbox. Individual selections primarily serve labels. | Tri-state select-page, all-results option, selection count and explicit bulk scope; phase 4 |
| F10 | P2 UI | Existing edit action is deep in detail panel after price/facts; no obvious row Edit or inline cells. | Row Edit, persistent detail actions, keyboard-accessible inline supported fields; phase 4 |
| F11 | P2 UI | Product create form is tall; settings has dozens of switches; dense purchase workflow sits in a narrow modal. | Short primary form, progressive details, full workspace for multi-line tasks; phases 2/4/5/7 |
| F12 | P2 UI | Purchase sticky action area visually intersects the scrolling line-content region at inspected size. | Separate scroll body and footer; no obscured focused fields at laptop heights/zoom; phases 2/5 |
| F13 | P2 UI + Code | Suppliers and purchase history are under Products → More actions; no independent route in App.tsx. | Discoverable Purchases and Suppliers workspaces with stable URLs; phases 2/5 |
| F14 | P2 UI | Shop switcher contains two identical names; name alone cannot identify target. | Secondary identifier/location and dirty-work handling on switch; phases 2/7 |
| F15 | P2 UI | Repeated headings, generous padding, helper copy and large cards reduce working area. | Consistent task density, tighter table layouts and compact cashier view; phase 2 |
| F16 | P2 UI | Credit note shows generic Paid and negative Paid/Total, although it represents a refund. | Document-aware status: Refunded / Applied to invoice; explicit amount/direction; phase 3 |
| F17 | P2 UI | New invoice and credit note showed “No activity yet”; payment later appeared in invoice history. | Creation, payment, return and cancellation timeline with actor/reference; phases 3/8 |
| F18 | P2 UI | “Shop activity” describes membership events only, despite sounding like all shop activity. | Rename scope immediately or implement unified business audit with filters; phase 8 |
| F19 | P2 UI + Code | Customer identity requires phone; named no-phone bill does not appear in Customers. | Deliberate walk-in vs saved-customer model and warnings for unlinked credit; phase 6 |
| F20 | P2 Code | Billing customer autocomplete is driven by customer_name; phone entry does not drive the search. | One searchable customer picker for name/phone/code, preserve explicit identity; phases 3/6 |
| F21 | P2 UI | Day-book bill numbers are plain text, and report KPIs lack obvious transaction drill-down. | Click through with date/filter context preserved; phase 6 |
| F22 | P2 UI | Invoice preview offers thermal formats but settings default-paper selector only A4/A5. | Consistent supported paper defaults and tested printer presets; phase 7 |
| F23 | P2 UI | Save wording/placement differs across forms; long forms can hide actions. Cancel bill is prominent beside routine actions. | Shared action hierarchy and consequence review; phase 2 |
| F24 | P2 Code | API client fetch has no explicit request timeout/AbortSignal; API request ID is not exposed by ApiError. | Read cancellation/time budgets, uncertain-write states, support reference; phase 8 |
| F25 | P2 Code | Product history returns latest 25 movements; customer payments latest 200, without complete-history pagination in these views. | Full ledger access, explicit “recent” labels until pagination ships; phases 4/6 |
| F26 | P2 Code | Customer and expense filters use local state, while catalogue uses URL query state. | Consistent shareable/preserved filters and back-navigation behavior; phases 2/6 |
| F27 | P2 Code / Verify | Customer/expense forms are not keyed to shop like NewBill and ProductsWorkspace; form state can remain while base shop changes. | Reproduce cross-shop dirty-form transition, then isolate drafts and prevent accidental submission into another shop; phase 1 |
| F28 | P2 Code / Verify | Product and expense create use ordinary POST without billing-style persisted idempotency. | Test timeout-after-commit/retry; add safe create operation identity where duplicates matter; phases 1/8 |
| F29 | P2 UI | Product picker omits available stock/unit; insufficient-stock error appears only after adding/editing quantity and is duplicated across cart/summary. | Show stock early; line-level actionable errors and a single summary; phase 3 |
| F30 | P2 Code | Bill preview query key contains full cart/customer; changes can trigger repeated pricing requests without preview debounce/cancellation. | Separate price-affecting inputs, short debounce and cancel stale reads, never enable save with stale totals; phase 3 |
| F31 | P2 UI | Purchase payment state “Not recorded” excludes it from supplier dues; this is easy to overlook. | Explicit payment decision or conspicuous unresolved-state queue; phase 5 |
| F32 | P2 Code / Verify | Operations documentation says deployment remains deferred while README describes deployed API. | Verify real operational state and replace contradictory readiness claims with dated evidence; phase 8 |
| F33 | P3 UI | Long account email wraps awkwardly; sidebar consumes substantial height; native selects and buttons vary in density. | Consistent identity presentation and navigation spacing; phase 2 |
| F34 | P2 Verify | Tax settings can alter future pricing and invoice presentation; historical rendering/snapshots need targeted verification. | Previously issued totals/tax identity remain reproducible; phase 7 |

Do not infer broken arithmetic from UX concerns: the small exercised sale/return/report cycle reconciled. F03/F04 are specific source-supported scale defects, not proof that the current local account has missing money.

## 4. Target experience and visual system

### Navigation

Use task-oriented groups, with role-filtered capabilities enforced again by API:

- Home: daily overview, alerts and resume work.
- Sales: New invoice (persistent primary action), Invoices & returns, Customers & dues.
- Inventory: Products, Stock movements/counts, Categories & units, Labels/imports.
- Purchasing: Purchases, Suppliers & payables.
- Business: Expenses, Reports, Activity.
- Settings: Shop, invoice/printing, team/access, subscription; personal account separate.

Avoid showing every subpage as an equally weighted sidebar item. Make frequently used tasks one navigation choice away. Every substantial workspace needs a URL, useful back behavior, meaningful page title and preserved filters. Settings/subscription should not compete with checkout.

### Sidebar and standard terminology — required

Refine the navigation proposal above into the following customer-facing structure. These labels are the initial naming contract for design and implementation; validate comprehension with shop owners and cashiers before release.

| Sidebar group | Destinations |
|---|---|
| Overview | Dashboard |
| Sales | Invoices, Customers |
| Inventory | Products, Stock movements, Stock counts, Categories & units |
| Purchases | Purchase invoices, Suppliers |
| Business | Expenses, Reports, Activity log |
| Administration | Shop settings, Team & permissions, Subscription |

- New invoice opens the checkout workspace; Invoices opens the saved sales-document list with invoice/credit-note filters. Use the persistent New invoice action as the creation entry point rather than a separate, ambiguously named Billing destination.
- Place a persistent **New invoice** primary action near the top. Keep the current shop and role visible; disambiguate duplicate shop names with location/code. Account profile, appearance and sign out belong in a separate bottom account menu.
- Use readable text with consistent icons, clear group spacing and one unmistakable active destination. Expand the group containing the current route. Preserve expanded/collapsed preference without resetting task state.
- Desktop supports expanded and compact sidebar modes; compact icons have accessible names and tooltips. Narrow web uses a dismissible navigation drawer with focus management, Escape/backdrop dismissal and automatic close after navigation. Keep the main workspace usable at small laptop heights.
- Keep the primary action and account access reachable while long navigation scrolls. Provide keyboard navigation, visible focus, accessible expand controls and an active-page announcement. Test both themes and 200% zoom.
- Show only role-permitted destinations. Do not expose placeholder destinations for planned features such as Stock counts until they are implemented. Subscription/access failures still need a clear route to recovery.
- Keep operational lists and specialist actions in context: label printing and import/export remain discoverable in Products; individual report types live within Reports. Do not turn every action into another sidebar entry.

#### Naming guide

| Concept | Standard UI wording | Rule |
|---|---|---|
| Start a sale | New invoice | Use consistently for entry actions; final posting action is Create invoice |
| Saved sales documents | Invoices | Detail title follows actual document type; credit notes are clearly identified |
| Customer-facing document | Invoice / Tax Invoice / Bill of Supply / Credit Note / Payment Receipt | Invoice is the ordinary sales-document default; retain applicable document-specific titles and validate tax requirements before implementation |
| Inventory master | Products | Avoid switching between catalogue, items and products for the same destination; “items” remains appropriate for bill lines |
| Receive inventory | Record purchase | Purchase invoices is the history destination; use Restock only for a product-specific shortcut |
| Stock changes | Adjust stock / Count stock | Distinguish corrections from purchases and sales |
| Sale price | Selling price | Distinguish from MRP, cost price and purchase-line unit cost |
| Customer debt | Amount due / Receivables | Use Amount due on records; Accounts receivable in reports, with plain-language help |
| Supplier debt | Amount payable / Payables | Accounts payable in reports; distinguish from customer dues |
| Payment states | Paid / Partially paid / Unpaid | Use consistently in filters, badges, lists, detail and exports |
| Return settlement | Refunded / Applied to invoice | Avoid generic Paid for a credit note when it obscures the settlement |
| Save edits | Save changes | New-record actions name the object: Add product, Add customer, Record payment |
| Leave an editor | Cancel / Close | Cancel abandons uncommitted edits with dirty-state handling; Close exits a read-only view |
| Remove a record | Archive / Delete / Cancel invoice | Label the actual behavior; never call archival or financial reversal Delete |
| History | Activity log | If only membership events are available, explicitly label Team activity until broader coverage exists |
| Business configuration | Shop settings | Account settings refers only to the signed-in person's preferences/security |
| Access management | Team & permissions | Role names remain Owner, Admin and Staff everywhere |
| Subscription | Subscription | Use consistently instead of alternating Cloud subscription, plan and Premium for the destination; Premium remains a plan name |

- Establish a shared vocabulary file/document and reusable formatting helpers. Apply naming to sidebar, headings, breadcrumbs, buttons, dialogs, validation messages, tooltips, empty states, notifications and exports. Internal API names need not be renamed merely to match display text.
- Prefer sentence case, explicit verbs and familiar shop language. Avoid backend wording such as “the server calculates” in normal user flows. Explain necessary terms once in context.
- Preserve existing URLs with redirects when routes change; bookmarks and back navigation must continue to work. Route labels and breadcrumbs must come from the same navigation definition.
- Phase 2 owns the sidebar and vocabulary foundation; each subsequent phase migrates its screens. Acceptance: users can locate New invoice, saved invoices, product editing, purchases and supplier/customer balances without coaching; no conflicting labels, duplicate active states or inaccessible compact controls remain.

### Checkout workspace details

Desktop: approximately 65% items / 35% customer and payment, adjusted to readable minimum column widths. Left starts with autofocus search/scan, quick category/recent-item access, then a dense editable cart. Right starts with a compact “Walk-in customer · Add customer” row, followed by totals, payment choice and a persistent completion action. B2B details expand only when selected. At constrained widths stack items first; summary is reachable without obscuring fields or creating page-wide horizontal scrolling.

- Physical USB/Bluetooth keyboard-wedge scanner is the first-class desktop path: scan exact barcode, handle terminator, increment repeated scans and restore focus. Never swallow typing in another field.
- Label the entry “Scan barcode or search products”; provide visible Scan mode, supported-scanner help and status. Camera scanning is a separate explicitly invoked capability with permission, unsupported-browser and manual fallback states.
- Barcode must resolve exact matches before fuzzy name search. Unknown barcode offers permitted quick product creation or a custom line; cancellation restores the cart. Duplicate barcode is an explicit data error, not an arbitrary match.
- Cart: product/code, available quantity/unit, editable quantity, permitted selling price/discount, tax indicator, line total, remove. Scan feedback must be visible and accessible; optional sound must not be the only signal.
- Quantity editing respects whole/fractional units; repeated scan must not create accidental duplicate lines. Stock revalidated atomically at save.
- Inline bill price overrides never silently modify catalogue price. Permission, reason and audit semantics must be defined first.
- Keep a stable total area while recalculating; mark pending totals and block final save until authoritative preview is current.
- Payment choices explicitly distinguish cash received, recorded UPI/card receipt and unpaid/part-paid. Do not claim payment processing or confirmation from selecting a method.
- Cash received can exceed amount due for change calculation; recorded settlement remains capped correctly. Split tender and hold/resume are planned extensions after base transaction correctness.
- Completion page: invoice number, amount received/due, Print, New invoice, View invoice. Clear “saved” confirmation; no ambiguous repeated create button.
- Draft lifecycle: save timestamp, resume/discard, per-user/shop boundaries, multiple tabs, logout/revocation handling, schema migrations, storage failures and retention policy. An uncertain submitted operation is locked to its original payload/key until resolved.

### Individual invoice workspace — reference-inspired update

Reference: user-supplied screenshot of another billing application, supplied after the initial audit. Use its clear document/action separation as inspiration, not its colors, branding, decorative watermark or claims about editing/tax requirements. This section specifies desired behavior; WhatsApp delivery, direct PDF download and posted-invoice editing were not demonstrated in the current Storely audit.

- Every invoice row opens a dedicated, bookmarkable detail page. Preserve list filters and scroll position on return. Show invoice number, document/payment status, customer, creation date, creator, total, paid amount and balance due without requiring the user to inspect the printed page.
- Desktop: large readable paper preview on the left; compact action/settings rail on the right. Keep controls reachable while the document scrolls. Narrow screens put the summary and actions above the preview with no overlapping fixed controls. Support both themes while the paper remains white.
- Primary actions: **Print**, **Download PDF**, **Share on WhatsApp**. Secondary actions: **Edit invoice**, **Record payment** when applicable, **Return items**, and **Duplicate as draft**. Show linked credit notes/payments and the activity/version history below the primary workspace.
- Print controls: A4/A5/80 mm/58 mm selection, appropriate template, margins/scale guidance and preview; expose supported logo, signature, item-code, HSN, tax-breakdown and footer presentation options in a compact expandable section. Do not blindly copy the reference's GST/HSN toggle behavior: display choices must not change stored tax calculations or remove fields required for the applicable document. Validate requirements during implementation.
- Clearly distinguish “This print only” from “Save as default.” Changing print options must never edit the transaction or silently alter other users' defaults. Preview, download and print use the same document renderer and selected options.
- **Download PDF** produces a real PDF download directly, with a useful filename and loading/error/retry state. Keep browser Print → Save as PDF as a fallback, not the only meaning of a PDF button. Rendering and downloading must not post another invoice.
- **Share on WhatsApp** opens a recipient/message review with customer phone when available, editable country code/number, invoice reference, total and appropriate attachment/link choice. Missing phone has a clear entry path. Sharing is initiated explicitly by the user; never send automatically on invoice creation.
- Distinguish a WhatsApp text/link handoff from actual PDF attachment support. Prefer supported file sharing where available; otherwise offer Download PDF + Open WhatsApp with clear attachment instructions, or a deliberately designed secure invoice link. Do not promise that a WhatsApp deep link can silently attach a local PDF.
- If secure invoice links are implemented, scope them to one document with expiry/revocation and controlled access; avoid exposing the customer account, other invoices or predictable public identifiers. Log link creation/revocation without logging sensitive message contents. Revalidate access for PDF generation/download.
- Do not label a handoff “Delivered.” Show only what is known: PDF downloaded, sharing opened, or actual provider-confirmed delivery if a future integration supplies it. Sharing failure must not affect invoice status.

#### Editing, returns and cancellation

- **Draft invoices:** freely editable, explicit Save draft/Create invoice and dirty-state recovery.
- **Saved invoices:** expose Edit invoice, but first explain the permitted changes. Reuse the familiar composer with current values, a reason for material corrections and a before/after review. Do not implement editing as an unrestricted overwrite of historical bill rows.
- Define a correction policy with the business owner before implementation: which metadata can change, which transactions can be amended, and when a linked corrective document is required. Paid, partially paid, returned, externally shared or otherwise locked documents need explicit handling. Do not assume the reference's “same invoice number” policy is universally appropriate.
- API correction must atomically reconcile stock deltas, payments/credits, customer balances, totals and reports; retain original versions, actor, reason and timestamps. Apply optimistic concurrency and durable idempotency. Never silently collect/refund money or rewrite a past payment to match an edited total.
- Returns remain a distinct workflow from correcting an entry mistake. Exchanges, if implemented, link a return and replacement sale with explicit net settlement and stock movements.
- **Remove Cancel invoice from the prominent routine action row.** Retain a restricted **Void invoice** action under More actions for authorized users when the business permits voiding an erroneous posted transaction. Show the stock/payment/credit-note impact, require a reason and confirmation, and retain the original document/number and audit trail. No hard deletion of posted financial history. This is a proposed safeguard to resolve the user's concern about a confusing Cancel bill action, not a requirement that cashiers see it.
- Acceptance: open an invoice → choose each supported paper → preview/print/download → review WhatsApp handoff; cancel sharing with no side effects. Edit a permitted invoice with correct ledger deltas; reject conflicting/locked edits clearly. Reprints/retries never duplicate a sale; unauthorized users cannot edit or void through UI or direct API.

### Distinct Products and Purchases workspaces

| Workspace | User's question | Primary layout/actions |
|---|---|---|
| Products | What do I sell, at what price, and how much is available? | Search/scan + filters; dense product table with sale price, unit, stock and alerts; Add product, visible row Edit, inline edits, select all, labels/import/export; detail with pricing and stock ledger |
| Purchases | What stock did I receive, from whom, and what do I owe? | Purchase summary + date/supplier/payment filters; receipt table with reference, supplier, date, total, paid/due and status; Record purchase; detail with lines, stock receipt, supplier payment and corrections |
| Suppliers | What have I bought from this supplier and what remains payable? | Searchable suppliers; payable/overdue summary; supplier detail with purchases, allocations, statement and Record payment |

- Move purchase history and purchase creation out of hidden Products menus into Purchases. Product-specific Restock remains a shortcut into the same purchase composer with the product prefilled, not a second implementation.
- Keep product creation distinct from receiving stock: adding a catalogue entry does not imply a supplier invoice. Allow explicit opening stock with an auditable movement; normal replenishment uses Record purchase.
- Purchase detail mirrors the invoice workspace's consistent header/summary/action patterns while using purchase-specific fields and permissions. Supplier document references must not be confused with Storely sales invoice numbers.
- Standardize field columns, input heights, inline row actions, totals placement, filters, empty/error states and responsive behavior across both areas. Preserve filters, unfinished work and cross-links when moving between a product, stock movement and source purchase.
- Acceptance: an unfamiliar user can explain and independently perform Add product, Edit product, Record purchase, Print labels and Pay supplier without treating them as interchangeable operations.

### Graphical KPIs — actionable dashboard and workspace summaries

- Dashboard first row: net sales, collections, outstanding receivables and gross profit for the selected period, with precise labels. Pair gross profit with cost-completeness information; never imply unknown costs are proven zero. Clearly mark all-time balances versus period flows.
- Use compact sparklines and previous-equivalent-period comparisons with absolute and percentage change. Handle zero comparison baselines as “No comparison,” not infinity. Show returns/refunds consistently and explain net values.
- Main charts: sales trend, collections by payment method, best-selling products/categories and expenses breakdown. Use suitable line/bar charts; avoid decorative charts with no action or unreadable crowded legends. Provide exact-value table alternatives and accessible labels.
- Inventory summaries: tracked products, low stock, out of stock, expiring stock and stock valuation with valuation basis. Click each metric to the corresponding filtered product/stock list.
- Purchases summaries: purchase value, supplier payments, outstanding payables and overdue payables, with filters and drill-down to source receipts. Separate recorded liabilities from receipts whose payment terms remain unknown.
- Customer summaries: outstanding amount, customers owing and ageing only when the due-date/ageing definition is established. Expenses show period total and category trend.
- Keep a consistent date control, compare-period rule, shop scope, timezone and “updated at” status. Explicit loading/unavailable states must not look like ₹0. Do not put real-time claims on periodically fetched data.
- All KPI values and chart buckets come from authorized API aggregates over the full requested dataset, not totals of the visible table page. Drill-down, dashboard, export and financial reports must reconcile under the same filters and rounding rules.
- Both themes need legible chart axes/tooltips and non-color-only distinctions. Graphs must resize without shifting or hiding primary actions; use lightweight initial summaries and defer expensive charts as needed.
- Phase 2 defines KPI/chart components; phases 4/5 add inventory/purchasing summaries; phase 6 delivers dashboard/report aggregation and drill-down. Acceptance includes empty, single-day, return-heavy, missing-cost, zero-baseline and large-data cases—not only attractive seeded charts.

### Catalogue editing details

- Product row exposes Edit and contextual actions without requiring a panel hunt. Detail panel has persistent title/actions.
- Inline safe fields initially: name, category, reorder level and permitted fixed price. Enter commits, Escape reverts, Tab moves predictably; saving/saved/error states are visible. Provide an explicit Save/Cancel affordance for pointer users.
- Formula-priced items expose their inputs and calculated result; never overwrite formula behavior by typing an unexplained price.
- Stock remains a ledger operation: Adjust stock / Count stock / Receive purchase with reason and before/after review. Never raw-patch the quantity cache through a table cell.
- Changes affecting price/tax show impact before commit; concurrent edits return a conflict with current values and a deliberate resolution path.
- Selection: header tri-state checkbox selects visible page; offer “Select all N matching products” separately. Freeze/filter scope, keep count, clear selection, exclude unauthorized/unavailable rows, and explain selection changes after filters/shop switch.
- Bulk actions: labels, export, category, reorder threshold, controlled price change and archive. Server resolves selected scope and validates authorization; large jobs show progress and downloadable row errors. No silent partial success.
- Product creation: name + pricing + unit/stock essentials, optional sections collapsed; category/unit/supplier quick-create returns focus and keeps input. Save & add another and duplicate product are useful later accelerators.

### Product barcodes and printable labels — agreed behavior

The barcode is a stable product lookup key, not a price. A product with printed MRP ₹100 and Storely selling price ₹90 must enter the bill at ₹90 when scanned, subject to the existing server pricing, tax and permitted discount rules. A price update changes future checkout pricing without changing the barcode; previously posted bills retain their original price snapshots.

- **Existing packaged product:** scan or enter its existing manufacturer barcode during creation. Keep that code; a second barcode is not required to charge the shop's own price.
- **Product without a barcode:** generate a unique internal code automatically on successful creation, atomically and safely across retries/concurrent creates. Display it on product detail and offer Print labels immediately. Do not require the owner to invent a code.
- **Optional shop label:** allow an internal barcode alias for a product that already has a package barcode. Both resolve to the same product and current price in the selected shop. Do not overwrite the manufacturer code. Model aliases explicitly in the API with uniqueness constraints and backward-compatible primary-barcode behavior.
- Treat barcode values as strings, preserving leading zeroes. Use an internal namespace and supported symbology (initially Code 128 for generated shop labels); do not pretend internally generated codes are registered retail EAN/UPC identifiers. Reject ambiguous matches within a shop; different shops may legitimately sell the same manufacturer-barcoded product at different prices.
- Generate once and keep stable across edits/imports/retries. Existing products with neither barcode nor usable code need an explicit migration/backfill path before label printing. Deactivated codes must not silently identify a different product later.
- Product detail actions: Print label / Reprint labels. Catalogue bulk action: Print labels for selected products, with select-page/all-results scope and adjustable copies per product. Offer labels after receiving stock as well.
- Label preview includes scannable barcode, human-readable code, product name and optional shop name/selling price. Explain that printed prices become stale after a price edit; offer reprint when price-bearing labels are affected. Scanning still uses current system pricing.
- Support adhesive label-sheet presets and label-roll presets with configurable label width/height, margins, gap, columns, copies and starting position for partially used sheets. Keep label-printer configuration separate from receipt-paper configuration.
- Provide actual-size print/PDF output, quiet zones and readable barcode dimensions, long-name handling, page-break checks and a test-label action. Show missing/invalid-code errors with repair actions rather than silently omitting requested products.
- Acceptance: create without barcode → generated code → print sticker → scan sticker → correct catalogue item/current price. Repeat with package barcode and internal alias, changed selling price, leading zeroes, repeated scan, multiple shops, duplicate rejection, retry and bulk copies. Verify with a real scanner and printer.

Current implementation evidence: `src/products/components/Labels.tsx` already renders labels using `barcode || product_code` and reports skipped unusable codes. This is a starting point, not automatic generation or a complete label-printing workflow. Extend it rather than presenting printing as entirely absent.

### Invoice terminology and printed titles — agreed update

- Use **New invoice → Create invoice → Invoices → View invoice** throughout the sales workflow, including navigation, page titles, buttons, confirmations, empty states and help. Use sentence case for controls; printed document headings may use uppercase consistently.
- The ordinary sales-document heading becomes **INVOICE**, replacing generic **BILL**. Use **TAX INVOICE**, **BILL OF SUPPLY** or **CREDIT NOTE** where the configured transaction/document type requires it. Validate the applicable tax rules during implementation; this naming plan is not a tax-compliance certification.
- **PAYMENT RECEIPT** acknowledges a payment against an invoice; it does not replace or create another sales invoice. Show the original invoice reference, amount received, payment method/date and remaining balance.
- Paper format is independent of document type: A4, A5, 80 mm and 58 mm versions use the same applicable heading. “Receipt 80 mm” describes a printer format, not a reason to rename a sales document Payment Receipt.
- Update default-title logic, sample previews, print/PDF output and accessibility labels together. Preserve intentionally customized titles and historical issued-document snapshots under an explicit migration policy; do not silently rewrite old documents.
- Keep internal billing module names and existing `/billing` URLs unless a separate routing change is justified. Display terminology can change without breaking API consumers or bookmarks.
- Acceptance: a newly created ordinary sale displays Invoice in preview and every paper format; applicable tax/supply/return documents retain their correct titles; recording a payment produces no duplicate sale; no conflicting Bill/New bill/Create bill wording remains in the redesigned ordinary-sales UI. Historical audit observations below describe the old interface and are not naming requirements.

### Invoice paper sizes and printer defaults

Current `src/billing/invoice/Invoice.tsx` offers **A4, A5, Receipt 80 mm and Receipt 58 mm**, with separate paper stylesheets. Actual hardware printing remains unverified. The saved settings selector currently accepts only A4/A5, and the invoice default logic maps other values back to A4: complete the web and API settings contract for thermal defaults.

- Allow all four supported formats as saved shop defaults, with an explicit per-print override. Restore the chosen default on a new bill, reload and next session; consider per-workstation printer preferences where counters use different printers.
- Model nominal paper width separately from printable width, margins and printer scaling. Thermal bills need content-driven height, compact totals and legible barcode/QR output; A4/A5 need reliable multi-page headers and totals/footer placement.
- Additional paper sizes are configurable presets only after layout and hardware validation; do not promise arbitrary printer compatibility. Provide paper preview, calibration/test print and clear instructions for browser scaling/margins.
- Test short and long bills, long names, discounts, taxes, partial payments, returns, QR codes and reprints on all four formats. Persisted preference, preview, PDF and physical output must agree.
- Keep document generation separate from print invocation. A failed/cancelled print must allow reprint of the saved invoice without creating another sale or stock movement.

### Light, dark and system appearance — required

- Support Light, Dark and System appearance across every web workspace, including login/onboarding, billing, products, purchases, reports, settings and platform administration. This is a planned requirement, not a claim that the existing UI already supports both themes.
- Use semantic design tokens for backgrounds, raised surfaces, text, borders, inputs, focus rings, overlays, disabled controls and success/warning/error states. Remove hardcoded page-specific colors as each screen migrates; do not implement dark mode by inverting the page.
- Default to the system preference until the user makes a choice. Persist the explicit preference, apply it before first paint to avoid a bright flash, and react to system changes when System is selected. Theme changes must preserve unsaved work, focus and current navigation.
- Keep field alignment, spacing, typography and component dimensions identical between themes. Cover hover, focus, selected, loading, readonly, disabled, invalid and empty states—not just the normal page background.
- Check tables, inline editors, native date/select controls, charts, tooltips, badges, dialogs, drawers, notifications, logos and QR/barcode previews in both modes. Charts and statuses must remain understandable without color alone.
- Validate text and non-text contrast against the accessibility target in both themes; test keyboard focus, zoom and operating-system forced-colors behavior. Use paired visual regression coverage for representative screens and states at supported widths.
- Invoice pages and adhesive labels remain **dark ink on white paper**, regardless of app appearance. The surrounding print-preview controls follow the app theme; the paper preview, PDF and physical print retain explicit print colors, scannable codes and no dark background ink fill.
- Acceptance: switching Light/Dark/System updates all visible surfaces without losing a cart or draft; preference survives reload; system changes are respected only in System mode; both themes pass contrast/layout checks; identical transactions produce identical readable printed output.

Deliver in phase 2 as part of the design-system foundation, apply throughout phases 3–8, and require both-theme acceptance in phase 9. Do not defer dark mode until every screen has accumulated its own colors.

### Shared component and interaction rules

Retain recognizable Storely identity but replace ad hoc page composition with a reusable system. Use restrained navy/neutral surfaces with an amber accent; reserve red for errors/destructive actions, green for confirmed success. Actual color values must pass measured contrast checks. Use one type family, tabular numerals for money, consistent spacing and a small heading scale. Dense operational tables should dominate more than decorative cards.

Component inventory: app shell, page header, breadcrumb, toolbar, search/combobox, field + hint + error, date range, data table, row/bulk actions, detail drawer, small dialog, full-page composer, totals panel, payment selector, confirmation review, toast/status region, skeleton, empty/error/offline state, pagination and print toolbar.

Interaction contract:

| Action class | Required behavior |
|---|---|
| Search/filter/select | Immediate response; no confirmation dialog |
| Small reversible field edit | Explicit commit or well-signalled autosave; recover input on failure |
| Multi-field create/edit | Visible Save/Add + Cancel, disabled duplicate submission, inline validation |
| Financial posting | Review current server total and effect; action says Create invoice / Record payment / Save purchase |
| Return/cancel/bulk change | Consequence summary, affected records/amount/stock, reason where required, explicit final action |
| Dirty close/navigation/shop change | Save draft / Discard / Keep editing; uncertain operations cannot simply be discarded |
| Successful save | Clear result, next useful action, audit trail; never success merely because a request was sent |

Dialog footer must remain visible without covering content. Keyboard focus stays visible, errors associate with inputs, Escape respects dirty state, and focus returns correctly. Test keyboard-only, screen-reader announcements, 200% zoom and reduced motion. Establish a WCAG 2.2 AA validation target; this audit does not certify conformance.

## 5. Phased delivery plan

Effort bands are planning estimates in focused engineering days, not promised dates. Assume one web engineer and one API engineer with design/QA support. Re-estimate after phase 0 and prototype testing. Work is complete when exit criteria pass, not when screens are merged.

### Phase 0 — Establish a trustworthy baseline (2–4 days)

Deliverables: isolated seedable demo environment, exact build identifiers, workflow inventory, reproducible defect tickets, design acceptance script and test-data reset procedure.

- Record routes, roles, API contracts, screen states and feature ownership; map each F-ID to a ticket.
- Inventory existing unit/integration/E2E tests and CI gates before adding coverage.
- Seed empty, ordinary and large shops: 10k products, >200 customer bills, >1,000 expenses, partial payments, returns, expired stock, suppliers, duplicate names, slow responses.
- Capture browser task times and screenshots for product creation, 5-item sale, restock, collect due and return.
- Verify hosted vs local feature parity; demo account must enter the correct paid workspace without operator intervention.
- Agree business rules for customer identity, return disposition, invoice correction, stock valuation and price permissions; do not guess legal requirements.

Exit: repeatable baseline and isolated data; every priority finding has evidence, owner, acceptance test and dependency. No production data needed for tests.

### Phase 1 — Protect money, stock and unfinished work (5–8 days)

Dependencies: baseline; can run alongside design-system prototyping.

- Fix F03/F04 with complete aggregates independent of paginated detail; expose history cursors and explicit totals.
- Reproduce F27 shop-switch state leakage across every form; scope/reset/guard all editable state consistently.
- Define durable operation envelopes for create/payment/return/purchase/expense and status lookup. Reuse existing API idempotency rather than inventing incompatible retry behavior.
- Add draft recovery foundation and dirty-close guard; persist exact uncertain operation payload/key safely. No auth tokens in browser storage.
- Preview complete purchase/return totals and effects; make unresolved payment terms obvious.
- Review optimistic concurrency, uniqueness constraints and transaction boundaries. Verify stock locks, atomic numbering and authoritative reprice on submission remain intact.

Exit: >200-bill and >1,000-expense totals match full ledger; navigation/reload/shop-switch cannot silently lose or misroute work; double-submit and timeout-after-commit produce one operation. Simultaneous last-item sales cannot oversell. No core correctness P1 unresolved.

### Phase 2 — Design system, navigation and layout foundation (5–8 days)

- Prototype checkout, catalogue, purchase and detail/confirmation surfaces with realistic data.
- Establish tokens and component contracts above; migrate shell and shared controls incrementally.
- Deliver Light/Dark/System appearance using semantic tokens, persistent preference and flash-free initial rendering; validate paired states and preserve white-paper printing.
- Group navigation by task; create stable routes for purchases/suppliers; disambiguate shops.
- Standardize loading/empty/error/success/permission/expired-session states and action placement.
- Fix scroll ownership, modal/drawer heights, responsive tables, long names, narrow layouts and focus restoration.
- Establish formatting conventions: rupees, decimal quantity, local dates, payment labels, status vocabulary.

Exit: reviewed representative flows at 1280×720, 1440×900, 1024-wide and 390-wide web; 200% zoom and keyboard pass. No obscured action or focused input. Client can find Sell, Receive stock, Edit product and Collect due without coaching.

### Phase 3 — Rebuild the daily billing workflow (8–12 days)

Dependencies: phase 1 safeguards + phase 2 components.

- Implement agreed left-items/right-customer-and-payment layout.
- Exact barcode lookup and hardware scan handling; repeated scans, no-match and focus behavior.
- Compact optional customer picker; B2B progressive fields; linked/unlinked credit warnings.
- Inline cart editing, stock visibility, current server preview, clear errors and durable hold/resume.
- Payment summary, cash/change, success screen, reprint and safe retry.
- Returns: original/sold/returned/remaining quantity, server refund preview, settlement choice, stock disposition and auditable reason.
- Cancellation: impact preview and deliberate action; preserve posted history and credit-note relationships.
- Deliver the individual invoice preview/action workspace, direct PDF download and explicit WhatsApp sharing handoff. Implement audited Edit invoice/correction policy; move restricted Void invoice into More actions instead of a prominent Cancel bill button.

Exit: cashier can complete a five-item walk-in bill via keyboard/scanner without mouse dependency or hidden required controls. Repeat scans increment correctly. Draft survives navigation/reload. Preview/saved/printed totals agree. Refund and due-reduction paths reconcile. Hardware scan and physical print validation must be performed, not substituted with jsdom.

### Phase 4 — Catalogue, inline editing and inventory control (6–10 days)

- Discoverable row Edit, concise create flow, persistent detail actions, safe inline edit.
- Select-page/all-matches and bulk action review with truthful counts.
- Full stock ledger with source links, reasons, actor, pagination and date filters.
- Low-stock/out-of-stock/expiry views with appropriate replenishment action.
- Unit-aware quantities, fractional/whole restrictions, barcode uniqueness, category/tax inheritance and price provenance.
- Import wizard: template, mapping, preview, duplicates policy, row errors, atomic/partial semantics, progress and retry safety. Existing import logic must be assessed and retained where correct.
- Labels: selection scope, barcode preview, copies, dimensions and real print alignment tests.
- Implement the agreed automatic internal barcode/alias lifecycle and adhesive-label workflows above, including existing-product backfill, post-save printing and price-change reprint prompts.

Exit: user edits an existing product and selects an entire page without explanation. Bulk scope stays accurate across pagination/filtering. Import replay creates no duplicates. Stock adjustment cannot bypass ledger or go below permitted bounds.

### Phase 5 — Purchases, suppliers and payables (6–10 days)

- Full purchase workspace with compact line table and visible complete totals before save.
- Supplier search/quick-create; invoice/reference, due date and payment decision in clear sections.
- Supplier ledger, purchase drill-down, payments/allocation, overdue views, statements and retry states.
- Consistent terminology for stock cost, tax, charges, landed cost, subtotal and final total. Explicitly decide whether charges affect valuation; current audit purchase showed ₹320 receipt while stock valuation used ₹60/unit.
- Duplicate supplier invoice/import warnings, batch/expiry entry and draft recovery.
- Specify correction/reversal process rather than destructive editing of posted stock receipts.

Exit: receiving stock → supplier due → payment → statement reconciles; user sees final amount before posting; no fields covered by sticky footer; duplicate/uncertain submissions safe.

### Phase 6 — Customers, collections, expenses and reports (6–10 days)

- Customer picker supports phone/name/code; explicit saved identity and duplicate/merge policy.
- Credit sale requires deliberate linkage or clear unassigned-credit workflow; avoid losing debts from customer views.
- Customer statement with complete aggregates, paginated transactions, payment allocation preview and printable/downloadable output.
- Expenses: concise entry/edit, receipt attachment proposal, recurring-entry proposal, search/date/filter persistence and duplicate protection.
- Reports: meaningful period comparisons, definition of each figure, clear return/refund treatment, clickable transactions and full-data export.
- Deliver graphical KPIs and accessible trends with period comparisons, clear scope/freshness and full-data API aggregates; every actionable metric drills into the matching records.
- Reconcile overview/day book/profit/loss/receivables/purchases/stock views using shared domain definitions.
- Distinguish “cash drawer change” from actual counted closing cash. Opening balance/count/reconciliation is a separate planned workflow.

Exit: each summary reconciles to underlying records including older history, cancellations and credit notes. Exports include full requested scope. Large datasets remain navigable. Timezone/date boundaries and empty periods tested.

### Phase 7 — Onboarding, settings and printing (4–7 days)

- Guided shop setup: identity → applicable tax configuration → invoice/printing → first product/import → first bill.
- Separate shop, pricing/tax defaults, invoice appearance, printing, team and subscription settings.
- Preview with clear unsaved state and consistent defaults for A4/A5/80mm/58mm.
- Extend saved paper-size API validation and frontend default resolution to thermal formats; add printer presets/calibration and safe reprinting without reposting a bill.
- Physical print checks for long item names, 1/50/200 lines, multiple pages, page breaks, footer/signature, returns and thermal widths.
- Preserve historical invoice correctness after changing shop defaults. Decide immutable invoice snapshots versus intentionally current branding explicitly.
- Clarify Premium pending/approved/activation/expiry flows for web-only customers without forcing unrelated platform steps.
- Team role explanations, invitation states and revoked-session handling; no broad role expansion for convenience.

Exit: new authorized owner completes setup without developer guidance; pending/subscription states offer a useful next action; configured print defaults match actual output; old invoices remain reproducible.

### Phase 8 — API and operational hardening (6–10 days plus operational validation)

Start instrumentation early; finish after core flows stabilize.

- Retain FastAPI domain modules, Decimal money, server pricing, RLS, scoped permissions, secure refresh cookie and in-memory access token. Avoid a framework/microservice rewrite as a substitute for fixing workflows.
- Consistent mutation/result/error contracts: field paths, conflict context, retry semantics, operation status and support request ID.
- Read cancellation and timeout budgets; writes distinguish rejected, pending/unknown and committed. Never blindly retry a financial write with a new key.
- Full-dataset aggregates; scalable pagination; measure query plans and indexes under large tenants. Existing offset pagination is not automatically a defect: change it where measured performance/stability warrants it.
- Generated OpenAPI/type checks, backward-compatible additive changes, migration rehearsal and cross-client contract tests.
- Business audit for product/price/stock/purchase/expense/payment/return/settings changes with actor, entity, time and appropriate before/after values. Redact secrets/PII from operational logs.
- Verify tenant boundaries and role restrictions on direct API calls, search, exports, bulk actions and cached data. Test revocation and shop switch, not just hidden navigation.
- Verify request/body/upload limits, file validation, formula-safe CSV exports, rate-limit behavior, refresh races across tabs, request IDs and failure alerts.
- Provider backup/PITR and isolated restore drill; establish measured RPO/RTO, alert ownership, retention and incident procedures. Existing local drill is not evidence of provider recovery.
- Reconcile deployment docs with real hosted state; establish reproducible demo and staging environments.

Exit: production-like concurrent reads/writes meet agreed latency/error budgets, restores demonstrated, alerts delivered to an owner, migrations/rollback rehearsed, and no unresolved high-impact isolation/correctness findings.

### Phase 9 — Acceptance, demo rehearsal and controlled rollout (3–5 days plus pilot)

- Client/staff task testing with unfamiliar participants; observe without teaching the interface.
- Run complete regression matrix below; repair observed friction before calling redesign finished.
- Clean, repeatable demo: setup → add/import → scan/edit bill → part payment → collect due → return → restock → reports → print.
- Roll out by feature flag/cohort, compare errors and completion times, retain rollback path. Preserve drafts and backward-compatible schemas across rollback.
- Obtain user acceptance on task outcomes and legibility, not only screenshots.

Exit: critical workflows complete independently, data reconciles, real hardware works, operations gates closed, and pilot has no unresolved P0/P1 defects. Cosmetic backlog may continue after release with named owners.

## 6. Engineering boundaries and ownership

| Area | Starting points | Ownership |
|---|---|---|
| Shell/design system | `storelyweb/src/components/layout`, `components/ui`, `index.css`, `permissions.ts`, `App.tsx` | Web + design |
| Billing/drafts/returns | `src/billing/NewBill.tsx`, `BillDetailPage.tsx`, `queries.ts`; API `app/routers/bills.py`, `app/domains/billing` | Web + API |
| Catalogue/inline/bulk | `src/products/ProductsPage.tsx`, `components/ProductForm.tsx`, `ProductDetailPanel.tsx`; API `domains/catalog`, `routers/catalog.py` | Web + API |
| Purchases/suppliers | `src/purchases`, `src/products/suppliers`; API `domains/purchases`, `routers/purchases.py` | Web + API |
| Customers/expenses | `src/customers`; API `domains/customers`, `routers/customers.py` | Web + API |
| Reports/printing | `src/reports`, `src/billing/invoice`; API `domains/reports` | Web + API + QA |
| Access/error/recovery | `src/api/client.ts`, `shops`, `auth`, `subscriptions`; API auth/deps/errors | Web + API |
| Operations | API `docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`, CI and deployment configs | API/operations owner |

Keep transport types separate from editable draft and view models. Extract reusable domain-oriented hooks/components when responsibilities justify them. Centralize query-key/invalidation policy so every write refreshes the affected bill, stock, customer, supplier and report views. Use authoritative responses; optimistic display must never imply a financial commit before success.

## 7. Regression and acceptance matrix

| Group | Required scenarios |
|---|---|
| Billing | Walk-in, saved customer, B2B, custom item, exact barcode, repeated/unknown scan, fractional unit, zero stock, discount boundaries, full/partial/unpaid, change and payment methods |
| Recovery | Dirty navigation, refresh, tab close, shop switch, session expiry, offline during preview, timeout after commit, repeated click, replay same key and conflict with changed payload |
| Stock | Concurrent last-unit sale, receipt plus sale, adjustment below zero, return restock/non-restock policy, cancellation reversal, batch expiry and ledger reconciliation |
| Customers | Phone formatting/duplicates, no-phone credit, 201+ bills with oldest unpaid, many payments, allocation preview and full statement |
| Expenses | 1,001+ records, filtered totals, date boundaries, create retry, editing conflict, report reconciliation |
| Purchases | Existing/new products, supplier optional vs terms required, charges/tax/discount, duplicate reference/import, malformed file, persisted draft and uncertain retry |
| Imports/labels | Empty/large/malformed files, duplicate barcode, row mapping, Unicode, formula injection, all-results selection, print dimensions and reprint |
| Reports | Date/filter semantics, returns/cancellations, full exports, aggregation limits, timezone midnight/month/year changes, drill-down totals |
| Permissions | Owner/admin/staff, direct route/API, cross-shop identifiers, cost visibility, bulk/export access, revocation, cached data |
| UI | Empty/loading/error/long text/large data, keyboard-only, focus/error announcements, 200% zoom, supported desktop and narrow web widths |
| Appearance | Light/Dark/System, preference persistence, first-paint flash, live system changes, all component states, chart/contrast checks, draft preservation and theme-independent white-paper invoices/labels |
| Printing | A4/A5/80mm/58mm, long bills, totals/page breaks, no sidebar, historical snapshots, actual printer and PDF output |
| Operations | Build parity, migration compatibility, rollback, backup restore, cold start, sustained writes/reads, monitoring alert delivery |

### Proposed measurable targets (establish baseline first)

- At least 90% of representative first-time users finish each core task without coaching.
- Typical five-item walk-in sale under 60 seconds after familiarization; scan-to-line feedback under 200 ms locally, with separately measured server latency.
- Typical product creation under 60 seconds; existing product edit under 15 seconds.
- Primary save action visible/reachable without losing edited context at 1280×720; no page-wide overflow at supported widths.
- Zero duplicate operations under replay/double-submit tests; zero silent draft loss in supported recovery paths.
- Preview, committed record, printed document and report aggregates reconcile to declared rounding rules.
- Suggested initial API goals: p95 search/preview under 500 ms and bill commit under 1 second at agreed representative load. Validate infrastructure and dataset assumptions before promising these as service commitments.
- No release based solely on passing unit tests: real browser, database, hardware, user-task and operational evidence all required.

## 8. First implementation queue

1. Reproduce and fix truncated customer dues and expense totals (F03/F04).
2. Establish safe billing draft/operation recovery and shop-switch isolation (F01/F02/F27).
3. Prototype item-first two-column checkout with optional right-side customer and visible scanner.
4. Standardize action/footer/scroll behavior across forms; fix overlapping purchase footer.
5. Add complete purchase and return review before posting.
6. Make product Edit obvious; implement safe inline fields and select-all semantics.
7. Promote purchases/suppliers into coherent workspaces.
8. Improve reports/customer collections and print/settings consistency.
9. Complete scale, isolation, recovery and operational release gates.

## 9. Further discovery backlog — not claimed as tested defects

Before implementation tickets are finalized, inspect import preview/commit with real files, label printing, supplier settlement, customer account collection, invalid/duplicate product edits, pricing inheritance changes, B2B tax combinations, multi-tab refresh, staff accounts, cancellation after returns, cancelled credit-note recovery, large exports and long-session behavior. Camera scanning, split tenders, quotations, delivery, purchase returns, recurring expenses, receipt attachments and stocktake sessions require product validation; do not add them all to the first release by default.

The plan should evolve from these evidence-backed workstreams. New findings must record trigger, observed versus expected behavior, affected users, source/UI evidence, phase and acceptance test. Maintain a finite, prioritized backlog instead of an unreviewable list of cosmetic changes.
