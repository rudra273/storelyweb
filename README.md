# storelyweb

Desktop web app for Storely shop owners and staff (React, TypeScript, Vite, Node 26).
Master plan: `/Users/rudra/projects/Storely/plan.md`. The API lives in
`/Users/rudra/projects/storelyapi`. Everything runs in Docker; you only need Docker.

```bash
make check      # lint, typecheck, tests, production build, dependency audit
make test       # just the tests
make lock       # refresh package-lock.json after editing package.json
```

Phase 0 contains only the skeleton. Sign-in, role-aware navigation and the API
client arrive in Phase 5; the dev server joins the API's `docker compose` stack
at that point so it is served over HTTPS at `https://app.storely.localhost`.

Rules: no tokens in `localStorage`, no `dangerouslySetInnerHTML` or `eval` (the
linter enforces both), and the server is the source of truth for money totals.
