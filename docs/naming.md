# Storely web: names and wording

The contract for customer-facing text, from `refractor.md`. Code lives in
`src/lib/vocabulary.ts` and `src/navigation.ts`; screens import from there
instead of retyping a label. Internal API and route names do not have to match.

## Sidebar

| Group | Destinations |
|---|---|
| Overview | Dashboard |
| Sales | Invoices, Customers |
| Inventory | Products |
| Purchases | Purchase invoices, Suppliers |
| Business | Expenses, Reports, Team activity |
| Administration | Shop settings, Team & permissions, Subscription |

- **New invoice** is a persistent action above the groups, not a destination.
- Destinations only appear for roles that may use them. Planned features
  (Stock movements, Stock counts, Categories & units as pages) are not shown
  until they exist.
- "Team activity" stays until more than membership events are recorded; then it
  becomes "Activity log".
- Page titles, breadcrumbs and the browser tab title come from the same
  definition, so they match the sidebar.

## Words

| Concept | Use | Rule |
|---|---|---|
| Start a sale | New invoice | Final action is **Create invoice** |
| Saved sales documents | Invoices | Credit notes are labelled as such |
| Inventory master | Products | "Items" is fine for lines on an invoice |
| Receive stock | Record purchase | History is **Purchase invoices** |
| Sale price | Selling price | Not MRP, cost price or unit cost |
| Customer debt | Amount due | Reports say "Accounts receivable" |
| Payment states | Paid / Partially paid / Unpaid | Same in filters, badges, lists, detail |
| Edit an existing record | **Save changes** | |
| Add a new record | Name the object: Add product, Add supplier, Record payment | |
| Leave an editor | **Cancel** (abandons edits, asks if there are any) / **Close** (read-only view) | |
| Role names | Owner, Admin, Staff | Everywhere |

## Formats

- Money: ₹ with two decimals and Indian digit grouping (`formatMoney`).
- Quantities: no trailing zeros (`formatQty`).
- Dates: `1 Nov 2026` (`day`); never ISO in the UI.
- Status labels come from `PAYMENT_STATUS`; do not write them inline.
