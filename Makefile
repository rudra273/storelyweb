.PHONY: image lock lint typecheck test build audit secrets check api-types api-types-check

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

secrets:         ## scan the repo and its history for committed secrets
	docker run --rm -v "$$PWD":/repo zricethezav/gitleaks:latest detect --source /repo --no-banner --redact

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
