# libp2p DHT node (reference service)

**Operator runbook (bootstrap hints → Hive / registry):** [`MESH_DHT_OPERATOR_RUNBOOK.md`](./MESH_DHT_OPERATOR_RUNBOOK.md). **Future DHT record model:** [`ADR-dht-directory-records.md`](./ADR-dht-directory-records.md).

## Role

The repository ships an **optional** Node process under [`services/libp2p-dht-node/`](../services/libp2p-dht-node/README.md) that runs **libp2p** with:

- **Kademlia DHT** (`kad-dht`, server mode / `clientMode: false`)
- **TCP** transport
- **identify** + **ping** (required by the DHT stack)
- Optional **bootstrap** peer list from env

It exposes a small **HTTP health** endpoint on **127.0.0.1** (not the DHT itself).

## What this is not

- Not a replacement for the **P1 HTTP registry** (`services/registry`).
- Not connected to **`GET /.well-known/hive-mesh.json`** or **`publicMesh.dhtBootstrapHints`** automatically — operators copy multiaddrs from health/logs into hints or DNS if desired.
- Not a **managed** global network: you still run bootstrap nodes, NAT traversal, and trust policies yourself.

## Relation to roadmap

See [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md): this service is a **concrete DHT process** in-repo; record signing and registrar logic remain in HTTP/registry layers unless you bridge them in a custom integration.
