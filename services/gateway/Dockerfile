# P2 gateway — optional Redis-backed rate limit (ioredis). Build from repo root.
FROM node:22-alpine
WORKDIR /app
COPY services/gateway/package.json services/gateway/package-lock.json ./
RUN npm ci --omit=dev
COPY services/gateway/src/server.mjs services/gateway/src/gateway-metrics.mjs services/gateway/src/gateway-bearer.mjs services/gateway/src/gateway-redis-rate-limit.mjs ./
ENV PORT=4080
EXPOSE 4080
CMD ["node", "server.mjs"]
