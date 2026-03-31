# libp2p + Kad-DHT (optional lab node)

Real [**libp2p**](https://libp2p.io/) stack with **Kademlia DHT** (`@libp2p/kad-dht`), **TCP**, **identify**, **ping**, optional **bootstrap** peers.

This is **not** integrated into the Hive Next.js app or the P1 registry HTTP API. Use it to experiment with peer discovery / DHT in parallel with [`docs/MESH_PLANETARY_P4_DHT_ROADMAP.md`](../../docs/MESH_PLANETARY_P4_DHT_ROADMAP.md).

**Publishing dial addresses as hints:** see **[`docs/MESH_DHT_OPERATOR_RUNBOOK.md`](../../docs/MESH_DHT_OPERATOR_RUNBOOK.md)** (`MESH_PUBLIC_DHT_BOOTSTRAP_URLS`, `REGISTRY_DHT_BOOTSTRAP_HINTS`).

## Run

```bash
cd services/libp2p-dht-node
npm ci
npm start
```

## Env

| Variable | Default | Role |
|----------|---------|------|
| `LIBP2P_LISTEN` | `/ip4/0.0.0.0/tcp/0` | Comma-separated listen multiaddrs |
| `LIBP2P_BOOTSTRAP` | *(empty)* | Comma-separated bootstrap multiaddrs |
| `LIBP2P_HEALTH_PORT` | `4092` | HTTP `GET /v1/health` |
| `LIBP2P_HEALTH_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` in Docker — see `Dockerfile` / `docker-compose.yml`) |

## Docker

From repo root: `docker build -f services/libp2p-dht-node/Dockerfile .`

Compose (P1–P3 stubs + DHT): `docker compose --profile planetary-dht up -d --build` (includes **`planetary-dht`**, port **4092**).

## Health JSON

`ok`, `role`, `peerId`, `listen[]`, `bootstrapConfigured`, `dht: "kad-dht"`.

## CI

`npm run check` (syntax only). **GitHub Actions:** workflow **Planetary extended smoke** (`planetary-smoke-extended.yml`, manual dispatch) builds the image and hits `/v1/health`. Default CI also builds the DHT image via `docker compose --profile planetary-dht build` in the **Planetary stubs (Docker build)** job.
