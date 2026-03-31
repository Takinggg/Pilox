# P1 registry stub — build from monorepo root: docker build -f services/registry/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY docs/schemas/hive-registry-record-v1.schema.json /schemas/hive-registry-record-v1.schema.json
COPY docs/schemas/hive-buyer-input-item.v1.schema.json /schemas/hive-buyer-input-item.v1.schema.json
COPY packages/pilox-buyer-config /packages/pilox-buyer-config
COPY services/registry/package.json services/registry/package-lock.json ./
RUN npm ci --omit=dev
COPY services/registry/src ./src
COPY services/registry/seed-record.example.json /seed/seed-record.example.json
ENV REGISTRY_RECORD_SCHEMA_PATH=/schemas/hive-registry-record-v1.schema.json
ENV REGISTRY_SEED_RECORD=/seed/seed-record.example.json
ENV PORT=4077
EXPOSE 4077
CMD ["node", "src/server.mjs"]
