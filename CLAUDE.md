# storelyweb: Storely web app

React + TypeScript + Vite desktop web app for shop owners. Cloud-only; talks
only to `storelyapi`. Priorities: Products and Reports first, Billing second.

Master plan, phases and open questions: `/Users/rudra/projects/Storely/plan.md`.
Read it first.

Related projects:
- API: `/Users/rudra/projects/storelyapi` (FastAPI). Its OpenAPI schema is the
  contract; generate the TypeScript client from it, do not hand-write types.
- Mobile app: `/Users/rudra/projects/Storely` (Flutter). Match its look
  (light theme, gold `#F5A623` + navy accent) and its business rules (GST,
  round-off, invoice numbering).

## Rules
- Verify before you build: investigate, report findings, wait for approval.
- Access token in memory only; refresh token in an httpOnly cookie. Never put
  tokens in localStorage or URLs.
- Never compute money totals in the browser as the source of truth; the server
  is authoritative. Display only.
- Handle loading, error, empty and data states for every query.
- Keep `tsc`, ESLint and tests green.
