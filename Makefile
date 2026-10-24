.PHONY: image lock lint typecheck test build audit secrets check

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

check: lint typecheck test build audit   ## everything CI runs
