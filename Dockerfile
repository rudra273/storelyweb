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

# ---- production-like server: static files, TLS, strict headers (docker/Caddyfile) ----
FROM caddy:2 AS serve
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Caddy wants a writable home; the container's file system is read-only.
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
EXPOSE 8443
