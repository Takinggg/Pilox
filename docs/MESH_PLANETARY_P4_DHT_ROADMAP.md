# P4 — DHT / Gossip (roadmap beyond the HTTP stub)

This repository implements **pull-based HTTP sync** between registries (`REGISTRY_SYNC_*`) and a **signed catalog** (`catalogProof` on `GET /v1/records`, consumer-side verification via `REGISTRY_SYNC_VERIFY_CATALOG`).

For discovery **without a central list** (Kademlia, hash gossip, NAT relays), the following would typically be needed:

1. **Transport**: libp2p, QUIC mesh, or an operated overlay (not the current Node stub).
2. **Directory**: DHT for `handle → peer(s)` or signed announcements propagated via gossip (content = catalog digest or Merkle references).
3. **Trust**: same primitives as here (Ed25519) but applied to **routing messages** and multiple **witnesses** — not just to `hive-registry-record-v1` records.

None of these points are required to validate the P1–P6 **repository reference** (that lane is **closed** in this repo: sync HTTP + signed catalog + operator policies + observability hooks). This file only separates **federated pull** from a future **Internet-scale DHT** if you need it.

## Shipped hints (no DHT implementation)

Operators can publish **bootstrap hints** for future overlays (multiaddr, `dnsaddr`, HTTPS rendezvous) without enabling routing in this repo:

| Surface | Configuration |
|---------|----------------|
| **`GET /.well-known/hive-mesh.json`** | `MESH_PUBLIC_DHT_BOOTSTRAP_URLS` (comma-separated) → `publicMesh.dhtBootstrapHints` on the Hive descriptor — see JSON Schema `hive-mesh-descriptor-v1` |
| **Registry health** | `REGISTRY_DHT_BOOTSTRAP_HINTS` or **`REGISTRY_DHT_BOOTSTRAP_URLS`** → `dhtBootstrapHints` array on **`GET /v1/health`** |

These are **curated strings** for clients and other stacks (e.g. libp2p); they do not start a DHT or NAT relay in Node.

### Optional in-repo libp2p process

For a **real** Kad-DHT listener (TCP + bootstrap), see **[`services/libp2p-dht-node/`](../services/libp2p-dht-node/README.md)** and **[`MESH_LIBP2P_DHT_NODE.md`](./MESH_LIBP2P_DHT_NODE.md)**.

**Planning (issues / PRs):** cross-cutting work (DHT, relays, policy, multi-region SLO) is tracked in **[`MESH_WORLD_NETWORK_EPIC.md`](./MESH_WORLD_NETWORK_EPIC.md)**.

**Operator procedure (hints only):** **[`MESH_DHT_OPERATOR_RUNBOOK.md`](./MESH_DHT_OPERATOR_RUNBOOK.md)** — run `services/libp2p-dht-node`, read `GET /v1/health`, copy dialable multiaddrs into **`MESH_PUBLIC_DHT_BOOTSTRAP_URLS`** (Hive) and **`REGISTRY_DHT_BOOTSTRAP_HINTS`** (registry).

**Design (future DHT records):** **[`ADR-dht-directory-records.md`](./ADR-dht-directory-records.md)**.
