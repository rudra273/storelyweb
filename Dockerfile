FROM node:26-slim AS deps
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- development / test image ----
FROM deps AS dev
COPY --chown=node:node . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- production build (static files in /app/dist) ----
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build

# The upstream 2.11.7 image carries Go 1.26.8 and x/net 0.59.0. Rebuild the same
# Caddy release with patched dependencies; go.mod/go.sum lock the full graph.
FROM golang:1.26.10-alpine AS caddy-build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
WORKDIR /src
COPY docker/caddy-build/go.mod docker/caddy-build/go.sum ./
RUN go mod download
COPY docker/caddy-build/main.go ./
RUN go build -mod=readonly -trimpath -tags nobadger,nomysql,nopgx \
    -ldflags="-s -w -X github.com/caddyserver/caddy/v2.CustomVersion=v2.11.7-storely.1" \
    -o /out/caddy .

# Shared by the front proxy and static web server. Keep security package fixes
# when the official Caddy image has not yet been rebuilt upstream.
FROM caddy:2.11.7 AS caddy
RUN apk upgrade --no-cache
COPY --from=caddy-build /out/caddy /usr/bin/caddy

# ---- production-like server: static files, TLS, strict headers (docker/Caddyfile) ----
FROM caddy AS serve
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Caddy wants a writable home; the container's file system is read-only.
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
EXPOSE 8443
