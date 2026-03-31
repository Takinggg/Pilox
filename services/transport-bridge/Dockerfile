# P3 transport-bridge (+ subscriber via CMD override) — build from monorepo root.
FROM node:22-alpine
WORKDIR /app
COPY docs/schemas/wan-envelope-v1.schema.json /schemas/wan-envelope-v1.schema.json
COPY services/transport-bridge/package.json services/transport-bridge/package-lock.json ./
RUN npm ci --omit=dev
COPY services/transport-bridge/src ./src
COPY services/transport-bridge/scripts ./scripts
ENV BRIDGE_ENVELOPE_SCHEMA_PATH=/schemas/wan-envelope-v1.schema.json
ENV PORT=4081
EXPOSE 4081
CMD ["node", "src/server.mjs"]
