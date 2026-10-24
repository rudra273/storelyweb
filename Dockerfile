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
# Serving them (with strict security headers) is decided in Phase 5/9.
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build
