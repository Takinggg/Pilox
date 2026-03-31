# P1 — Global Agent Directory (draft spec)

> **Status**: draft for product scoping / interop — **no** mandatory implementation in Hive at this stage.
> **Link**: [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1 (milestone **P1**).

## 1. Objective

Enable the **resolution** of a **stable handle** (agent or tenant identifier) to **discovery metadata** sufficient to contact the instance (typically an **Agent Card** over HTTPS), **without** requiring each operator to manually maintain all URLs worldwide.

## 2. Out of scope (v0 of this spec)

- Application transport (messages, queues, relay) → **P2 / P3**.
- Full DHT or gossip → **P4**.
- Legal identity proof (KYC) → future / third-party registry.

## 3. Concepts

| Concept | Definition |
|---------|------------|
| **Registry** | Service that stores and serves **records** (public or semi-public reads). |
| **Stable handle** | Opaque or semi-opaque identifier, unique within a **namespace** (e.g. `did:…`, `urn:hive:agent:…`, or derived key). |
| **Record** | Signed or attested JSON document describing how to reach the agent (URLs, public keys, capabilities). |
| **Trust anchor** | Mechanism that binds the handle to control of an **HTTPS origin** or a **key** (Ed25519 signature, ACME, existing signed manifest). |

## 4. Logical record schema (`registry-record-v1`)

**Minimum** fields for interop; exact names may be finalized in a later JSON Schema.

```json
{
  "schema": "hive-registry-record-v1",
  "handle": "urn:hive:agent:sha256:…",
  "updatedAt": "2026-03-20T12:00:00Z",
  "ttlSecondsRecommended": 3600,
  "agentCardUrl": "https://origin.example/.well-known/agent-card.json",
  "meshDescriptorUrl": "https://origin.example/.well-known/hive-mesh.json",
  "capabilities": ["a2a-jsonrpc", "tasks"],
  "publicKeys": {
    "ed25519": [{ "kid": "k1", "publicKeyHex": "64hex…" }]
  },
  "proof": {
    "type": "ed25519-signature",
    "signer": "https://registry.trust.example",
    "sigHex": "128hex…"
  }
}
```

- **`handle`**: stable for the client; the **minting** method (key hash, DID, etc.) is **specific to the registry** or the registry federation.
- **`agentCardUrl` / `meshDescriptorUrl`**: aligned with endpoints already standardized on the Hive side ([`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md), `hive-mesh-descriptor-v1`).
- **`proof`**: variant depending on the model (registry signature, holder signature, or both).

## 5. Read / write API (proposal)

All responses in JSON; standard HTTP errors; **no secrets** in **public** read payloads. Writing relies on a **server secret** (Bearer), not exposed to end clients.

| Method | Path | Role |
|--------|------|------|
| `POST` | `/v1/records` | *(Optional stub)* Body = full **hive-registry-record-v1** record; `Authorization: Bearer <REGISTRY_WRITE_SECRET>`; **403** if writing is not enabled. |
| `DELETE` | `/v1/records/{handle}` | **Revocation**: removes the handle from the store (and Postgres if configured). Bearer = `REGISTRY_REVOKE_SECRET` if defined, otherwise `REGISTRY_WRITE_SECRET`. Same rate limit as **POST**. |
| `GET` | `/v1/records/{handle}` | Retrieves the canonical record (or **404**). If `REGISTRY_ENFORCE_VALID_UNTIL=1` and `validUntil` has passed → **410** `record_expired`. |
| `GET` | `/v1/records` | *(Optional / P4)* List of known handles (catalog for sync between registries — see [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md)). |
| `GET` | `/v1/resolve?agentCardUrl={url}` | *(Optional)* Finds the handle(s) published for this origin (beware enumeration — rate limit). |
| `GET` | `/v1/health` | Registry health (for probes). |

Recommended headers: `Cache-Control` proportional to `ttlSecondsRecommended`; `ETag` for validation.

## 6. Relationship with existing Hive code

| Hive mechanism | Role in P1 |
|----------------|------------|
| `GET /.well-known/hive-mesh.json` | **Pointer** already public toward `agentCardUrl`, `jsonRpcUrl`, federation, `publicMesh.bootstrapMeshDescriptorUrls` — **level 0** directory (per instance). |
| Signed peer manifest (`MESH_FEDERATION_PEERS_MANIFEST_*`) | **Level 0** **closed** directory (list of approved peers). |
| P1 | **Level 1+**: aggregation or **indirection** (multiple instances / agents) behind a registry API. |

A possible **Hive implementation** later: separate service or Postgres tables + CDN in front; **not** required in the Next monolith to validate the spec.

## 7. Security & abuse

- **Aggressive rate limiting** on `resolve` by prefix / IP.
- **Registry reputation** (allowlist of "trusted" registries on the client side) — out of scope for the transport spec.
- **Revocation**: **`validUntil`** field (stub: read returns **410** if `REGISTRY_ENFORCE_VALID_UNTIL=1`; write rejected **400** `record_body_expired` if `REGISTRY_REJECT_EXPIRED_WRITES=1`); signed revocation list or key rotation — to be completed before production v1.

## 8. Versioned artifacts (repo)

- **JSON Schema**: [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json)
- **OpenAPI 3.1**: [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml)
- **Server stub**: [`services/registry/`](../services/registry/) — `GET /v1/health`, `GET /v1/records` (optional Bearer if catalog is protected), `POST` / **`DELETE`** `/v1/records…` (Bearer), `GET /v1/records/{handle}`, `GET /v1/resolve`; optional **read** limits and security headers — see service README.
- **Global traceability**: [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md)
