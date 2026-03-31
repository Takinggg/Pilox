# Build from repository root: docker build -f app/Dockerfile .
# (Compose: context `..`, dockerfile `app/Dockerfile` — needs `packages/` for local file: deps.)

FROM node:22-alpine AS base

# ── Dependencies ───────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /build
COPY packages/a2a-sdk ./packages/a2a-sdk
COPY packages/pilox-buyer-config ./packages/pilox-buyer-config
# Install SDK dependencies first (file: deps need their node_modules)
WORKDIR /build/packages/a2a-sdk
RUN npm ci --omit=dev
WORKDIR /build
COPY app/package.json app/package-lock.json ./app/
WORKDIR /build/app
RUN npm ci

# ── Builder ────────────────────────────────────────────
FROM base AS builder
WORKDIR /build/app
COPY --from=deps /build/app/node_modules ./node_modules
COPY --from=deps /build/packages/a2a-sdk ../packages/a2a-sdk
COPY packages/pilox-buyer-config ../packages/pilox-buyer-config
COPY app .

ENV NEXT_TELEMETRY_DISABLED=1

# @pilox/a2a-sdk uses prebuilt dist/ checked into the repo — no build needed here.
WORKDIR /build/app

ENV NODE_ENV=production
# `next build` evaluates modules that call `env()` — dummy values only (never used at runtime; Compose/K8s inject real secrets).
# hadolint: secrets in image history are non-production placeholders
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    AUTH_SECRET="docker-build-only-placeholder-min-32-chars!!" \
    AUTH_URL="http://127.0.0.1:3000" \
    ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
RUN npx drizzle-kit generate 2>/dev/null || true
RUN npm run build
# postbuild runs `scripts/fix-standalone-client-manifests.mjs` (manifests, static/, public/)
# Self-contained migration runner (no tsx in prod image)
RUN npx esbuild@0.27.4 src/db/migrate.ts --bundle --platform=node --target=node22 --outfile=migrate.cjs
RUN npx esbuild@0.27.4 src/db/marketplace-index-bootstrap.ts --bundle --platform=node --target=node22 --outfile=marketplace-index.cjs
RUN npx esbuild@0.27.4 src/db/migrate-encrypt-tokens.ts --bundle --platform=node --target=node22 --outfile=migrate-encrypt-tokens.cjs

# ── Runner ─────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Install pg_dump for database backups + tini for PID 1 + su-exec for privilege drop
RUN apk add --no-cache postgresql16-client tini su-exec

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /build/app/public ./public

# Standalone output includes server.js and required node_modules
COPY --from=builder --chown=nextjs:nodejs /build/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /build/app/.next/static ./.next/static

# Copy drizzle migrations for runtime migration support
COPY --from=builder /build/app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /build/app/migrate.cjs ./migrate.cjs
COPY --from=builder --chown=nextjs:nodejs /build/app/marketplace-index.cjs ./marketplace-index.cjs
COPY --from=builder --chown=nextjs:nodejs /build/app/migrate-encrypt-tokens.cjs ./migrate-encrypt-tokens.cjs
# Pilox copilot PEFT adapter (populate with: cd app && npm run dataset:fetch-modal-lora)
COPY --chown=nextjs:nodejs app/models/pilox-copilot-lora ./models/pilox-copilot-lora
# Drop HF Trainer checkpoint dirs (duplicate of root adapter); keeps image smaller
RUN find ./models/pilox-copilot-lora -mindepth 1 -type d -name 'checkpoint-*' -exec rm -rf {} + 2>/dev/null || true
COPY --chown=nextjs:nodejs app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Entrypoint runs as root to fix Docker socket permissions, then drops to nextjs via su-exec

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Public LB-style probe — do not use /api/system/health (viewer+ auth required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
