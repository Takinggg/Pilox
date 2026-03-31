# hive-registry (Helm)

Minimal chart for the Hive **P1 registry** HTTP service (`services/registry`). Default container port **4077**; health **`GET /v1/health`**.

## Build image

From repo root:

```bash
docker build -f services/registry/Dockerfile -t hive-registry:local .
```

## Configure secrets (required)

The registry needs at least:

- `REGISTRY_DATABASE_URL` — Postgres connection string
- `REGISTRY_WRITE_SECRET` — shared secret for write endpoints (see `services/registry/README.md`)

Optional: Redis rate limiting and catalog/metrics env vars as documented in the service README.

Create a Kubernetes Secret (example):

```bash
kubectl create secret generic hive-registry-env \
  --from-literal=REGISTRY_DATABASE_URL='postgresql://...' \
  --from-literal=REGISTRY_WRITE_SECRET='...'
```

## Install

```bash
helm upgrade --install hive-registry ./deploy/helm/hive-registry \
  --set image.repository=your-registry/hive-registry \
  --set image.tag=v1.2.3 \
  --set envFrom[0].secretRef.name=hive-registry-env
```

Enable Ingress and TLS in `values.yaml` (`ingress.enabled`, `ingress.tls`) or use your platform’s gateway in front of the ClusterIP service.

For **TLS and mTLS at the edge**, see `docs/deploy/edge-tls-mesh-services.md` and `docs/MESH_MTLS.md`.
