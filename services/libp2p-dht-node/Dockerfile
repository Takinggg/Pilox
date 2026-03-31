# Optional P4 lab node — build from monorepo root:
#   docker build -f services/libp2p-dht-node/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY services/libp2p-dht-node/package.json services/libp2p-dht-node/package-lock.json ./
RUN npm ci --omit=dev
COPY services/libp2p-dht-node/src ./src
ENV LIBP2P_HEALTH_PORT=4092
ENV LIBP2P_HEALTH_HOST=0.0.0.0
EXPOSE 4092
CMD ["node", "src/main.mjs"]
