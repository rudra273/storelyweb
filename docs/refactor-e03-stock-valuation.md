# E03 stock valuation — web verification

Date: 22 November 2026. Baseline web revision: `648d990` (clean before this slice). Scope: D03 / R05 web report verification, cost-policy explanation and browser/CSV acceptance. No valuation arithmetic changed in React.

## Proven copy defect and change

`StockValuePage` treated the API `gst_registered=false` valuation flag as proof that a shop is unregistered. In this report the flag means recoverability: composition shops also include nonrecoverable purchase GST in cost. The explanation now says purchase GST is included when it cannot be recovered, avoiding an incorrect registration claim. Updated the existing report test.

## Independent contract and real browser evidence

Used `storelyapi/tests/fixtures/stock_valuation_contract_v1.json`, SHA-256:

`1a1e09884f30ae0448da5eb39aa310e59a082688080d822cb407a70c35ff0486`

Coordinator provisioned three isolated synthetic premium shops, one per contract case. Demo data was untouched. Current-checkout host Vite at `http://localhost:5173` proxied actual requests to the local Docker API/PostgreSQL. Chromium performed normal password sign-in separately for each case, selected the isolated shop via the app's remembered-selection mechanism, opened `/reports/stock` and downloaded the actual CSV through the UI.

| Case | Cost total | Sale total | Result |
|---|---:|---:|---|
| Regular | 237.53 | 192.03 | Passed |
| Composition | 276.65 | 192.03 | Passed |
| Unregistered | 276.65 | 192.03 | Passed |

Each case verified all six row names/order, signed quantities including negative stock, exact API unit-cost/cost-value/sale-value, rendered monetary values, grand totals, zero-stock/untracked/deleted exclusions, correct explanation and CSV row/totals. Browser runtime errors were absent. The script did not create/change business records or modify API configuration; coordinator owned fixture cleanup.

Executable harness: `e2e/stock-valuation.cjs`. It accepts only local web origins and reads credentials from the ignored temporary seed path, never tracked source. Invocation used:

```sh
PLAYWRIGHT_MODULE=/tmp/storely-web-e00-runtime/node_modules/playwright \
CHROME_EXECUTABLE=/Users/rudra/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
STORELY_VALUATION_EVIDENCE=/tmp/storely-valuation-web-evidence.json \
node e2e/stock-valuation.cjs
```

The coordinator's seed file `/tmp/storely-valuation-fixture.json` has `{email,password,shops:[{id,name,case_id}],run}`. `STORELY_VALUATION_SEED`, `STORELY_VALUATION_CONTRACT` and `STORELY_WEB_ORIGIN` allow alternate isolated paths/local origins. Export CSV parsing is intentionally scoped to the simple fixture labels, which contain no commas or newlines.

## Checks and limitations

- Focused report tests: 13 passed.
- Typecheck, lint, syntax check and production bundle build passed.
- Real Chromium/API/UI/CSV acceptance: all three cases passed, exit 0.
- Main bundle size warning remains; no performance claim made.
- This slice does not prove mobile parity, PDF/Excel output, hardware printing, all historical valuation configurations or production deployment. The coordinator integrates independent mobile/API evidence.
