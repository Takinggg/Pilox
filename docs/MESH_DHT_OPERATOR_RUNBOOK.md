# DHT discovery — operator runbook (libp2p node ↔ Hive / registry hints)

**Scope:** how to run the optional [`services/libp2p-dht-node/`](../services/libp2p-dht-node/) process, read **dialable multiaddrs**, and publish them as **curated hints** on Hive (`MESH_PUBLIC_DHT_BOOTSTRAP_URLS` → `publicMesh.dhtBootstrapHints` in `GET /.well-known/hive-mesh.json`) and on the registry (`REGISTRY_DHT_BOOTSTRAP_HINTS` / `REGISTRY_DHT_BOOTSTRAP_URLS` → `dhtBootstrapHints` on `GET /v1/health`).

**Not in scope:** Hive or the registry **starting** a DHT, validating multiaddrs, or auto-syncing hints. Hints are opaque strings for clients and other stacks (see [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md)).

**Tracking:** GitHub issue [#2](https://github.com/Takinggg/Hive/issues/2) (epic [`MESH_WORLD_NETWORK_EPIC.md`](./MESH_WORLD_NETWORK_EPIC.md)).

---

## 1. Run one lab node

From the repository root:

```bash
cd services/libp2p-dht-node
npm ci
npm start
```

Default listen: `/ip4/0.0.0.0/tcp/0` (random TCP port). Health (localhost only):

```bash
curl -sS http://127.0.0.1:4092/v1/health | jq .
```

Expected JSON fields: `ok`, `role`, `peerId`, `listen[]`, `bootstrapConfigured`, `dht`.

**Pick a dialable multiaddr:** choose one entry from `listen` that peers can reach (e.g. LAN IP + port, or `127.0.0.1` for same-host experiments). Each element is already a full multiaddr including `/p2p/<peerId>`.

### Fixed port (recommended for docs / demos)

```bash
LIBP2P_LISTEN=/ip4/0.0.0.0/tcp/4001 npm start
```

Then `listen` will include `/ip4/<your-ip>/tcp/4001/p2p/<peerId>`.

---

## 2. Two-node bootstrap (same machine)

**Terminal A — bootstrap server**

```bash
cd services/libp2p-dht-node
LIBP2P_LISTEN=/ip4/0.0.0.0/tcp/4001 npm start
```

**Read A’s multiaddr on loopback**

```bash
curl -sS http://127.0.0.1:4092/v1/health | jq -r '.listen[] | select(test("127.0.0.1"))' | head -1
```

Example shape: `/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...`

**Terminal B — joiner** (use another health port to avoid clash)

```bash
LIBP2P_BOOTSTRAP=/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW... LIBP2P_HEALTH_PORT=4093 npm start
```

Confirm B’s health shows `bootstrapConfigured` ≥ 1.

---

## 3. Publish hints on Hive

Hive env: **`MESH_PUBLIC_DHT_BOOTSTRAP_URLS`** — comma-separated strings (max 64, max length per hint 2048). Parsed by `parsePublicDhtBootstrapHints` in [`app/src/lib/mesh-public-bootstrap.ts`](../app/src/lib/mesh-public-bootstrap.ts); **not** validated as URIs (multiaddr and `dnsaddr` strings are allowed).

Example (single hint):

```bash
MESH_PUBLIC_DHT_BOOTSTRAP_URLS=/ip4/203.0.113.50/tcp/4001/p2p/12D3KooWYourPeerIdHere
```

Restart the Hive app, then check:

```bash
curl -sS https://your-hive.example/.well-known/hive-mesh.json | jq .publicMesh.dhtBootstrapHints
```

---

## 4. Publish hints on the registry

Registry env: **`REGISTRY_DHT_BOOTSTRAP_HINTS`** or **`REGISTRY_DHT_BOOTSTRAP_URLS`** (same comma-separated hint strings). Surfaced on **`GET /v1/health`** as `dhtBootstrapHints` (see [`services/registry/README.md`](../services/registry/README.md)).

---

## 5. Security and operations notes

- **Curated only:** anyone who trusts your descriptor/health will treat hints as suggestions. Compromise of env or release pipeline can poison hints — use normal secret hygiene and review changes.
- **Firewall / NAT:** published addresses must be reachable from the intended peers; `0.0.0.0:random` is not a public address until you map a stable IP/DNS and port.
- **Health endpoint:** bound to **127.0.0.1** only — do not expose it to the network without a sidecar reverse-proxy policy you control.

---

## 6. Verification transcript (template)

Record in PR or ticket when validating this runbook:

```text
OS:
Node: v…
Commands: (paste)
Health sample: {"ok":true,"role":"hive-libp2p-dht",...}
Well-known snippet: dhtBootstrapHints: [...]
```

---

## See also

- [`MESH_LIBP2P_DHT_NODE.md`](./MESH_LIBP2P_DHT_NODE.md)
- [`services/libp2p-dht-node/README.md`](../services/libp2p-dht-node/README.md)
- [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md)
