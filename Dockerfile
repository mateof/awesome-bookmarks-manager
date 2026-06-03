# syntax=docker/dockerfile:1.7

# --- Builder: builds both web (SPA bundle) and api (Fastify) in one stage ---
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace manifests first so the deps layer caches independently of sources
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/crypto/package.json ./packages/crypto/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter "@awesome-bookmarks/api..." \
      --filter "@awesome-bookmarks/web..."

# Sources
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build both apps (turbo respects ^build topology so shared/crypto build first)
RUN pnpm exec turbo run build \
      --filter=@awesome-bookmarks/api \
      --filter=@awesome-bookmarks/web

# Deploy api with production-only deps into /out (drops devDependencies)
RUN pnpm --filter @awesome-bookmarks/api deploy --prod /out

# --- Runtime ---
# Plain Node + Debian's Chromium (~400 MB) instead of the Playwright base
# image (which ships Chromium + Firefox + WebKit and weights ~1.5 GB).
# The snapshot worker reads CHROMIUM_PATH (set below) and calls
# `chromium.launch({ executablePath })` from playwright-core.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    API_PORT=3001 \
    PUBLIC_DIR=/app/public \
    CHROMIUM_PATH=/usr/bin/chromium

# Chromium + minimal fonts so captured pages don't render with tofu boxes.
# fonts-noto-cjk is 100 MB but Asian-text snapshots are otherwise unreadable.
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-noto-cjk \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.source="https://github.com/mateof/awesome-bookmarks-manager" \
      org.opencontainers.image.description="AwesomeBookmarks self-hosted: API + snapshot worker + SPA in one container" \
      org.opencontainers.image.licenses="MIT"

# API runtime (production-only deps) and its compiled output
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/package.json ./package.json

# The SPA build is served by Fastify static from /app/public
COPY --from=builder /repo/apps/web/dist ./public

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
