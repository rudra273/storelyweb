# E03 D10 — sale quantity validation

22 November 2026. Sale-only input contract: trimmed plain decimal digits, optional fraction, positive and at most 1,000,000, at most three fractional digits after trailing zeros are removed. Leading/trailing zeros and surrounding whitespace are accepted; exponent notation, signs, missing whole/fraction digits and overprecision are refused.

`checkout/quantity.ts` validates and normalizes new sale request quantities. Catalog and custom cart editors keep raw text in drafts, show an accessible inline error and block pricing/posting while invalid. Text inputs with decimal keyboard hints preserve invalid text instead of the browser silently clearing it. Preview/post use the same normalized value. Frozen uncertain attempts continue to retry their original body; they are not normalized or rebuilt.

Custom-item creation uses the same contract. Re-scanning an invalid edited quantity leaves the raw edit unchanged rather than silently interpreting exponent notation or replacing it with NaN. A scan that would increment past the bound is refused. Purchase/stock precision is unchanged.

Tests cover parser boundaries/zero/signs/exponents/precision and accepted trailing zeros, plus both catalog/custom cart UI persistence, no preview or post on invalid input and normalized preview/post once corrected. Existing billing tests retain uncertain-operation/replay coverage. Quantity input expectations now assert string values because these controls intentionally preserve raw text.

D01 remains open: web still shows the cart, customer and settlement sections together, with automatic preview and a Create invoice completion action; the separate mobile checkout sheet has not been converted into the same logical presentation by this slice. Explicit settlement defaults and quantity parity do not establish full workflow parity.

Verification: three targeted test files passed, 136 tests; typecheck, lint and production build passed. Existing bundle-size warning remains. No live browser/emulator test was run in this web slice; coordinator owns cross-client acceptance.
