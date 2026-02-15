# === Stage 1: Build ===
FROM node:22-slim AS builder

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
FROM node:22-slim

WORKDIR /app

# Copy standalone Next.js output (includes node_modules + server)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/clawstash.db

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server.js"]
