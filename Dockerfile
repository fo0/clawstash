# === Stage 1: Build ===
FROM node:26-slim AS builder

WORKDIR /app

# Git info passed as build args
ARG BUILD_COMMIT_SHA=""
ARG BUILD_BRANCH=""
ENV BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA}
ENV BUILD_BRANCH=${BUILD_BRANCH}

# Build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN mkdir -p public
RUN npm run build

# === Stage 2: Production ===
FROM node:26-slim

WORKDIR /app

# The app runs as the unprivileged `node` user (uid 1000) for
# defense-in-depth. Pre-create the data directory so named volumes inherit
# the correct ownership on first run.
RUN mkdir -p /app/data && chown -R node:node /app /app/data

# Copy standalone Next.js output (includes node_modules + server)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/build-info.json ./build-info.json

# Entrypoint starts as root, fixes bind-mount ownership of the data dir
# (Docker creates ./data root-owned on Linux hosts), then drops privileges
# to `node` via setpriv before exec'ing CMD. `command -v setpriv` asserts
# at build time that the base image ships the privilege-drop tool.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && command -v setpriv

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/clawstash.db

EXPOSE 3000

VOLUME ["/app/data"]

# No USER directive: docker-entrypoint.sh needs root for the one-time chown
# and immediately drops to `node` (uid 1000) for the server process.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
