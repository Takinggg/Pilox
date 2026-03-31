# P4 — Dynamic Discovery (reference: "federated registries")

> **Goal**: deliver a **pragmatic alternative** to a full DHT (libp2p Kademlia, etc.), aligned with [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1 — *"multiple federated registries that synchronize (signed pull) without a full DHT"*.

## Out of scope (intentionally)

- Peer-to-peer NAT traversal, public relays, probabilistic gossip.
- DHT / CRDT for the global catalog (this stub remains **HTTP pull** between trusted operators).

## What is implemented

| Element | Role |
|---------|------|
| `GET /v1/records` | Response `{ "handles": string[] }` — inventory of handles present in the stub's store. May require a Bearer if `REGISTRY_CATALOG_SECRET` is set (see P1). |
| `REGISTRY_SYNC_PEER_BASES` | Comma-separated list of origins (e.g. `http://127.0.0.1:4078`) with no required trailing slash. |
| `REGISTRY_SYNC_INTERVAL_MS` | Pull interval (ms). `0` (default) = no sync. |
| `REGISTRY_SYNC_AUTH_BEARER` | *(Optional)* Sent as `Authorization: Bearer` on sync `GET` requests to peers (protected catalog / records). |
| `REGISTRY_SYNC_VERIFY_ED25519_PROOF` | If `1`: refuses to merge a remote record whose Ed25519 proof (if present) does not verify — reduces poisoning when records are signed. |
| `REGISTRY_SYNC_VERIFY_CATALOG` | If `1`: refuses the pull if the `GET /v1/records` response does not include a valid **`catalogProof`** Ed25519 (see `hive-registry-catalog-ed25519-v1` on the impl. side). |
| `REGISTRY_SYNC_CATALOG_PUBKEY_HEX` | *(Optional)* Expected public key (64 hex); if empty, the key embedded in `catalogProof.publicKeyHex` is used for verification. |

### Signed catalog (anti-typo / anti-substitution of the listing)

On the **emitting** instance, `REGISTRY_CATALOG_SIGNING_KEY_HEX` (64 hex characters = 32-byte Ed25519 seed) and optionally `REGISTRY_CATALOG_SIGNING_KID` cause **`catalogProof`** to be added to `GET /v1/records`. Peers that enable `REGISTRY_SYNC_VERIFY_CATALOG` only process the catalog if the signature matches the announced `handles` and `issuedAt`.

Operator write policy (complements sync): **`REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST`** and **`REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST`** reject `POST /v1/records` bodies outside allowed handle prefixes or Agent Card hosts (see [`services/registry/README.md`](../services/registry/README.md)).

DHT / gossip roadmap (out of scope for the stub): [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md).

On each tick, the stub queries each peer: `GET {peer}/v1/records`, then `GET {peer}/v1/records/{handle}` for each handle. Records are validated with **Ajv**; a remote record replaces the local one **only** if `Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)` and if the above rules (sync proof) allow it.

OpenAPI: [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) (`listRecordHandles`).

## Operations

Two instances on different ports, each with its own seed; on the "consumer" instance, set the above variables to periodically pull records from peers.

For a **real** P4 "Internet scale", a trust model **on the catalog itself** would still be needed (manifest signatures, CRDT) along with fine-grained anti-enumeration limits — partly addressed on the registry side by **read rate limiting** (`REGISTRY_READ_RATE_LIMIT_*`) and **authenticated catalog** (`REGISTRY_CATALOG_SECRET`), but not equivalent to a DHT.
