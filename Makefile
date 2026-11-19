.PHONY: image lock lint typecheck test build audit secrets scan-image check api-types api-types-check e2e e2e-onboarding e2e-invoice-recovery e2e-invoice-locks

# Everything runs in Docker (Node 26); the host needs only Docker.
IMG = storelyweb:dev
RUN = docker run --rm -v "$$PWD":/app -v /app/node_modules $(IMG)

image:           ## build the dev image
	docker build -q --target dev -t $(IMG) .

lock:            ## refresh package-lock.json after editing package.json
	docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
	  -v "$$PWD":/app -w /app node:26-slim npm install --package-lock-only --ignore-scripts

lint: image
	$(RUN) npm run lint

typecheck: image
	$(RUN) npm run typecheck

test: image
	$(RUN) npm test

build: image
	docker build -q --target build -t storelyweb:build .

audit: image      ## known-vulnerability scan of dependencies
	$(RUN) npm run audit

scan-image:       ## scan the actual Caddy/static production image
	docker build -q --target serve -t storelyweb:serve .
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image \
	  --no-progress --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed storelyweb:serve

secrets:         ## scan the repo and its history for committed secrets
	docker run --rm -v "$$PWD":/repo zricethezav/gitleaks:latest detect --source /repo --no-banner --redact --config /repo/.gitleaks.toml

# openapi.json comes from the API (`make openapi` in storelyapi writes it here).
OPENAPI_TS = openapi-typescript@7.13.0
api-types:       ## regenerate src/api/schema.d.ts from openapi.json
	docker run --rm --user "$$(id -u):$$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
	  -v "$$PWD":/app -w /app node:26-slim npx --yes $(OPENAPI_TS) openapi.json -o src/api/schema.d.ts

api-types-check: ## fail when the committed types do not match openapi.json
	@cp src/api/schema.d.ts /tmp/schema.committed.d.ts && $(MAKE) -s api-types >/dev/null 2>&1 \
	  && diff -q /tmp/schema.committed.d.ts src/api/schema.d.ts >/dev/null \
	  && echo "api types are up to date" || { echo "api types are out of date: run make api-types"; exit 1; }

check: lint typecheck test build audit api-types-check   ## everything CI runs

# Real browser against the real stack (run `make up` in ../storelyapi first). The API's
# rate limits are loosened for the run, as for the mobile tests, and put back after.
e2e:             ## browser end-to-end test of sign-in, roles, two-step, sessions
	cd ../storelyapi && STORELY_RATE_LIMIT_SCALE=1000 docker compose up -d --wait api >/dev/null
	docker run --rm --add-host host.docker.internal:host-gateway --add-host app.storely.localhost:host-gateway -v "$$PWD/e2e":/e2e:ro $(if $(SHOTS),-v $(SHOTS):/shots -e SHOTS=1) \
	  mcr.microsoft.com/playwright:v1.64.1-noble sh -c \
	  'mkdir /tmp/p && cd /tmp/p && npm init -y >/dev/null && npm i playwright@1.64.1 >/dev/null 2>&1 && NODE_PATH=/tmp/p/node_modules node /e2e/live.cjs'; \
	status=$$?; cd ../storelyapi && docker compose up -d --wait api >/dev/null; exit $$status

# Bounded current-onboarding smoke. Start the shared API and a current-checkout
# Vite server first; this target never restarts the API or changes rate limits.
# PLAYWRIGHT_MODULE may point at an isolated runtime; optional CHROME_EXECUTABLE
# selects an already-installed compatible Chromium. See docs/refactor-e00-baseline.md.
e2e-onboarding:
	node e2e/onboarding.cjs

# Coordinator-created isolated premium fixture only; never uses a personal shop.
e2e-invoice-recovery:
	node e2e/invoice-recovery.cjs

# Same-origin cross-tab locking; no account or business fixture required.
e2e-invoice-locks:
	node e2e/invoice-locks.cjs

# Run-owned premium fixture with two unpaid purchases; see E01 supplier evidence.
e2e-supplier-payment-recovery:
	node e2e/supplier-payment-recovery.cjs

# Run-owned premium product fixture only; actual server CAS and dirty-only rebase.
e2e-product-revision:
	node e2e/product-revision.cjs
