# === Stage 1: Build ===
FROM node:22-slim AS builder

WORKDIR /app

# Git info passed as build args (used by Vite for build-info.json + frontend)
ARG BUILD_COMMIT_SHA=""
ARG BUILD_BRANCH=""
ENV BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA}
ENV BUILD_BRANCH=${BUILD_BRANCH}

# Build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Prune to production dependencies only
RUN npm prune --omit=dev

# === Stage 2: Production ===
FROM node:22-slim

WORKDIR /app

# Copy production node_modules (includes pre-built better-sqlite3 native addon)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server source + package.json
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server ./server

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/clawstash.db

EXPOSE 3001

VOLUME ["/app/data"]

CMD ["npm", "start"]
