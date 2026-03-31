# Mesh V2 — global objective (agents across the planet)

> **Product goal**: allow agents (and Hive nodes) to **communicate beyond a single tenant / a single OS**, with discovery, trust, and transport suited for **WAN** — without abandoning the local v1 (Redis + A2A on a single instance).

The v1 is the **copper ring**: same instance, same Redis, protocol and observability. The v2 is the **Internet of agents**: federation, global addressability, and delivery semantics where pub/sub is no longer sufficient.

---

## 1. Principles

1. **Open but verifiable**: not every peer is trusted; identity and policy before sensitive traffic (cf. Layer 5 `TECH_VISION.md`).
2. **Interop**: A2A / Agent Card as lingua franca when possible; bridges to other stacks if needed.
3. **Degradation**: an isolated node remains usable (local v1 mode); the WAN mesh is **additive**.
4. **No network magic**: NAT, firewalls, and data jurisdiction remain the operator's responsibility; this document describes **patterns**, not a promise of illegal circumvention.

---

## 2. Technical pillars (logical order)

| Pillar | Role | Candidate OSS (indicative) |
|--------|------|----------------------------|
| **A. Directory & discovery** | Resolve "which Agent Card for this agent / this tenant?" | Federated Hive server, DNS/SRV, well-known HTTPS, signed registry, gossip (libp2p kad-dht) as an option. |
| **B. WAN transport** | Messages with ack, queues, replay between sites | **NATS JetStream** (hub + leaf nodes), **Redis Streams** (less native for multi-site), **libp2p** (streams + relay) for peer-to-peer. |
| **C. Trust** | Proof of origin outside private Redis | **mTLS**, **federated JWTs**, **DID/VC** (progressive), alignment with existing `meshSig` / A2A keys. |
| **D. Policy** | Who can invoke whom, inter-tenant quotas | Central or replicated PDP; mandatory audit on cross-domain delegation. |
| **E. Observability** | End-to-end WAN traces | `traceparent` / `meshMeta.correlationId` propagation already started in v1; OTel export + multi-hop correlation in V2. |

---

## 3. Proposed phases (deliverables)

### Phase V2.0 — "Controlled" federation

- Two (or N) Hive instances **mutually approved** (admin pairing + shared secret or PKI).
- Outbound: outbound A2A proxy to the other domain (fixed URL, mTLS).
- Inbound: dedicated ingress — **`POST /api/a2a/federated/jsonrpc`** (alias of the A2A JSON-RPC handler, same federation auth) + optional IP allowlist (`MESH_FEDERATION_INBOUND_ALLOWLIST`).
- **Deliverable**: runbook + config; not yet "anyone on Earth".

#### V2.0.1 — Implemented in code (config + visibility)

- Variables: **`MESH_FEDERATION_ENABLED`**, **`MESH_FEDERATION_PEERS`** (comma-separated list of HTTPS origins).
- **`GET /api/mesh/federation/status`** (viewer+): JSON `{ meshV2, federation }` without secrets.
- **`GET /api/a2a/status`** now includes **`federation`** (same payload as above) for the Settings → A2A / mesh dashboard.
- Production warning if federation is enabled without any **valid** parsed peer (empty list or only invalid URLs).

#### V2.0.2 — Operator probe (reachability)

- **`GET /api/mesh/federation/status?probe=1`** (**operator+**): the server performs a GET to **`/.well-known/agent-card.json`** on **each origin** in the **effective list** (static peers + signed roster manifest merged — see V2.2.1; arbitrary client-side paths are not possible — no open SSRF). Response: `{ meshV2, federation, probe: [...] }` with HTTP status, latency, and any error per peer. If federation is disabled or has no valid peers, `probe` is an empty array.
- **`GET /api/mesh/federation/status?debug_manifest=1`** (**operator+**): adds **`manifestDebug`** (`manifestLastError`, `effectivePeerCount`) — `manifestLastError` = stable token (`snake_case` or `http_NNN`) or **`unknown`** if the value is not recognized (never a raw exception message); can be combined with **`?probe=1`**. A shared peer resolution with the `federation` body avoids a second `resolveFederationPeers` in the same request when probe/debug is requested.
- **UI**: Settings → **A2A / mesh**, when federation is enabled — **Probe peers** button (same `?probe=1` endpoint, session cookie).
- **Tests**: `app/src/lib/mesh-federation-probe.test.ts` (fetch mock); `app/src/app/api/mesh/federation/status/route.test.ts` (auth + probe mock).

#### V2.1 — Federated JSON-RPC transport (short-lived JWT + optional secret)

- Variable **`MESH_FEDERATION_SHARED_SECRET`** (≥32 characters, **same value** on each paired node) — serves as the **HS256** signing key for the JWT **and** (if enabled) for hash + timing-safe comparison of the legacy header.
- **Inbound**: `POST /api/a2a/jsonrpc` with **exactly one** of the headers **`X-Hive-Federation-JWT`** (preferred, duration **`MESH_FEDERATION_JWT_TTL_SECONDS`**) or **`X-Hive-Federation-Secret`** (legacy). Both at once → **400**. **`exp` / `iat`** verification with configurable clock skew tolerance (**`MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS`**, default 60 s, 0 = strict). Each JWT minted by Hive includes a unique **`jti`**; reception consumes this **`jti`** once in **Redis** (TTL until **`exp`**) — **replaying the same token → 401**. If Redis is unavailable during this step → **503**. **`MESH_FEDERATION_JWT_REQUIRE_JTI`** (default **true**) requires the presence of **`jti`**; **`MESH_FEDERATION_JWT_REQUIRE_AUDIENCE`** (default **true**) requires an **`aud`** claim equal to the public origin of this instance; **`MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET`** (default **true**) — if **false**, only JWT is accepted (secret alone → **403**). **`MESH_FEDERATION_PROXY_SEND_SECRET`** (default **false**): the proxy only sends the legacy secret on the wire if explicitly enabled. A2A identity **`hive-federated`** (equivalent to **operator** for the JSON-RPC RBAC ceiling). **Audit**: after handler execution, Postgres action **`mesh.federation.inbound_jsonrpc`** (method, HTTP status, JWT/legacy mode, `iss` if useful, correlation).
- **Outbound (operator proxy)**: `POST /api/mesh/federation/proxy/jsonrpc` (**operator+**, session or API token), JSON body `{ "peerIndex": 0, "rpc": { ... } }` — `peerIndex` aligned with the order of parsed origins in `MESH_FEDERATION_PEERS`. The server relays to `https://<peer>/api/a2a/jsonrpc` with a fresh JWT including the **`aud`** claim = target peer's origin (anti-replay on another instance). If **`MESH_FEDERATION_PROXY_SEND_SECRET=true`** (default), also sends **`X-Hive-Federation-Secret`** for backward compatibility. Response (including **SSE**) forwarded to the client. **Audit**: action `mesh.federation.proxy_jsonrpc`.
- **Status**: `GET /api/mesh/federation/status` exposes `meshV2: "2.10.0"`; the `federation` block includes `wanMesh` (public descriptor, peer ceiling, manifest), `phase`, `sharedSecretConfigured`, `jsonRpcProxy` (paths, headers, JWT TTL, audience, **`jwtAlg`** HS256/Ed25519, local Ed25519 public key if applicable, **`jwtRequireAudience`**, **`jwtRequireJti`**, **`proxyOperatorTokenRequired`**, proxy secret flag, **`inboundAllowLegacySecret`** — **never** the raw secret).
- **Ed25519 (optional)**: `MESH_FEDERATION_JWT_ALG=Ed25519` — JWTs signed with a local seed (`MESH_FEDERATION_ED25519_SEED_HEX`, 64 hex); each peer registers the **public key** of others in `MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS` (same order as `MESH_FEDERATION_PEERS`). The **`iss`** claim = public origin of the issuer; the signature is verified with the peer's key. **mTLS** between instances remains recommended at the **reverse proxy / LB** level (outside application-level `fetch` scope).
- **Rate limit**: dedicated Redis **window** (`MESH_FEDERATION_RATE_LIMIT_MAX`, `MESH_FEDERATION_RATE_LIMIT_WINDOW_MS`, default 100 / 60s) — key **`in:<IP>`** for inbound JSON-RPC (federation header) and **`proxy:<operatorId>`** for `POST /api/mesh/federation/proxy/jsonrpc`, independent of the generic A2A rate limit.
- **Directory (no HTTP fetch from the endpoint)**: `GET /api/mesh/federation/directory` (**viewer+**) — lists **`peers[]`** with `peerIndex`, `origin`, `hostname`, `agentCardUrl` for the **effective list** static + manifest (same order as the proxy). Also exposed as `federation.directoryPath` in `GET /api/a2a/status`. Runbook: [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md).
- **Inbound IP allowlist**: `MESH_FEDERATION_INBOUND_ALLOWLIST` optional — if set, only listed IPs can use inbound federated auth (**JWT or secret**, checked **before** verification). Public status: `federation.federationInboundAllowlistActive`.

### Phase V2.2 — Optional public directory

- Publishing Agent Cards (or pointers) in a **registry** (self-hosted Hive or trusted third party).
- Schema: tenant id, capabilities, endpoints, Noise/signing public keys.
- **Deliverable**: OpenAPI / JSON schema spec + minimal reference server.

#### V2.2.1 — Implemented (discovery + signed roster)

- **`GET /.well-known/hive-mesh.json`** (public, no auth): `hive-mesh-descriptor-v1` descriptor — instance origin, Agent Card / A2A JSON-RPC URLs, `federation` + `wanMesh` block (peer ceiling, configured manifest, static/manifest counters, last manifest error if fetch/verify fails). Short `Cache-Control`; `Access-Control-Allow-Origin: *` for indexing / tooling.
- **`MESH_FEDERATION_MAX_PEERS`** (default 512, max 8192): ceiling after static + manifest deduplication.
- **Signed manifest**: `MESH_FEDERATION_PEERS_MANIFEST_URL` + `MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX` (Ed25519, 64 hex). JSON body `{ "payload": { "v": 1, "peers": [...] }, "sigHex": "128 hex" }` where the Ed25519 signature covers `stableStringify(payload)` (same canonicalization as `mesh-envelope`). Static peers remain first; manifest entries without a valid Ed25519 key are ignored in `MESH_FEDERATION_JWT_ALG=Ed25519` mode. **Security**: in production (`NODE_ENV≠development`), only **`https:`** is accepted for the manifest URL; HTTP response limited to **2 MiB** (stream + `Content-Length`) to prevent OOM.
- **Resolution**: `resolveFederationPeers` caches the merged roster in **Redis** (`hive:cache:federation_peers:v1:*`) with TTL = **`MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS`** (seconds, bounded 30–86400), plus an in-memory L1 cache per worker. The logical key includes the manifest URL, the signing public key, and the static parameters. If Redis is unavailable (read/write), falls back to L1 + fetch. **Manifest HTTP fetch**: distributed lock **`SET … NX`** under **`hive:lock:`** + same suffix as the cache key for **single-flight** across workers (others wait for cache population; fetch fallback if wait exceeds timeout). **`buildMeshFederationPublicAsync`** reuses the same snapshot for **`wanMesh`** and the **transport ready** boolean (no second resolve in this path). **Inbound JSON-RPC** in **Ed25519**: a shared resolve between the "verification ready" gate and JWT verification. Directory, probe, proxy: merged list. Structured logs: module **`mesh.federation.resolve`** (manifest success/failure, Redis errors — no secrets).
- **Public status**: `federation.wanMesh` exposes `manifestLastSyncOk` and `manifestIssueCategory` (safe values: `fetch` / `verify` / `size` / `protocol` / `unknown`) — no raw error string on `/.well-known/hive-mesh.json`.
- **`meshV2`** exposed as **2.10.0** on federation status / directory routes and **`GET /.well-known/hive-mesh.json`** (public mesh bootstrap + identity / reputation / public API keys + per-key scopes + opt-in reputation blocking + public tier OTel metrics — see V2.3).

### Phase V2.3 — Open mesh (Internet)

- DHT-style discovery / public relays (libp2p model or equivalent) — **outside current application scope**; delivered alternative: **`MESH_PUBLIC_MESH_BOOTSTRAP_URLS`** (third-party `hive-mesh.json` URLs published in **`GET /.well-known/hive-mesh.json`** → `publicMesh.bootstrapMeshDescriptorUrls`).
- **Bootstrapped (MVP transport)**: JSON-RPC **without auth** for **explicitly allowlisted** methods (`A2A_PUBLIC_JSONRPC_*`, default **off**), Redis rate limit **`hive:rl:public_a2a`** per IP, identity **`hive-public-a2a`** — see **[`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md)** and `GET /api/a2a/status` → **`publicJsonRpc`** / **`publicMesh`**. Alias **`POST /api/a2a/jsonrpc/public`** (same handler); `/.well-known/hive-mesh.json` exposes **`publicJsonRpcUrl`** when public mode is active.
- **Per-identity rate limit**: configurable header + SHA-256 hash → **`hive:rl:public_a2a_id`** (in addition to the IP bucket).
- **Public API keys**: **`A2A_PUBLIC_JSONRPC_API_KEYS`** + bucket **`hive:rl:public_a2a_apikey`**; option **`A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY`** (see `MESH_PUBLIC_A2A.md`).
- **Reputation (opt-in)**: Redis counters **`hive:mesh:pub_rep:*`** per API key hash or identity; **optional blocking** by threshold on `rate_limited`+`rpc_error` (HTTP 429) — see **`MESH_PUBLIC_A2A.md`**.
- **Immediate follow-up (doc / ops)**: advanced reputation (beyond Redis thresholds), enriched threats (`MESH_PUBLIC_A2A.md`).
- **Planetary follow-up**: see **§3.1 — Planetary mesh trajectory** (DHT/relay, global directory, WAN gateway).

### §3.1 — Planetary mesh trajectory (target: "Internet of agents")

> Goal: beyond **static bootstrap** (`MESH_PUBLIC_MESH_BOOTSTRAP_URLS`, signed manifests, paired federation), enable **discovery and transport** that **do not depend** on a closed list of URLs manually maintained by each operator — while remaining **verifiable** and **revocable**.

**This is not a single iteration**: multiple teams / quarters, with infrastructure choices (self-hosted vs public network).

#### Recommended milestones (logical order)

| # | Milestone | Role | Notes |
|---|-----------|------|-------|
| **P1** | **Global directory spec** | Registration schema (tenant / agent id, capabilities, `agentCardUrl`, public keys, proof of domain control or key signature) + **public** or **semi-public** read API | Draft: **[`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md)**. |
| **P2** | **WAN Gateway** (dedicated process) | TLS termination, global rate limit, circuit breaking, egress to NATS / libp2p / peers — **outside** the Next.js thread | Draft ADR: **[`MESH_PLANETARY_P2_WAN_GATEWAY.md`](./MESH_PLANETARY_P2_WAN_GATEWAY.md)**; see also §4. |
| **P3** | **Multi-hop transport** | Durable queues + ack between sites: **NATS JetStream** (hub + leaf), or **Redis Streams** limited multi-region, or **libp2p** (streams + relay) for P2P | Draft ADR: **[`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md)**; choose **one** MVP pivot (often NATS or managed relay) before adding DHT. |
| **P4** | **Dynamic discovery** | **DHT** (e.g., libp2p Kademlia) and/or **gossip** on a subset of peers; **public** or community **relays** for NAT | "Pragmatic" alternative: **multiple federated registries** that synchronize (CRDT / signed pull) without full DHT — useful in enterprise. |
| **P5** | **Progressive trust** | Keep federated JWTs + `meshSig`; add **DID / VC** or **per-registry** attestations for **open** agents; PDP policy **replicated** or **centralized** depending on the model | Aligned with Layer 5 `TECH_VISION.md` — not blocking for an initial "directory + relay". |
| **P6** | **WAN observability** | End-to-end OTel traces (`traceparent` already started), inter-region SLOs, `meshMeta.correlationId` correlation on **every** hop | Complements the metrics already added on the public tier side. |

**Reference in this repository (stubs)**: P4 "federation pull" registry ([`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md)), P5 `proof` hook ([`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md)), P6 W3C propagation on the bridge → ingress path ([`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md)) — see [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md).

#### Risks to explicitly accept

- **Abuse**: an open mesh attracts spam and enumeration — **reputation**, quotas, and relay **cost** must be budgeted from P2–P3.
- **Jurisdiction**: a "planetary" relay may transit data outside the region; the **operator** remains responsible (cf. principle §1 "no network magic").
- **Governance**: who signs the global manifests / registries? Without governance, the DHT quickly becomes **unreliable** for trust (only for **reachability**).

#### Additional success criteria (planetary)

1. An agent can **resolve** a stable handle (e.g., DID or `agent://` + registry) to an **Agent Card** without knowing the instance URL in advance (outside a local static list).
2. Two nodes **without mutual public IPs** can establish an **application channel** (relay + auth) with **documented** latency and cost.
3. Revocation of a peer or a certificate **propagates** within the chosen trust model (TTL, CRL, registry, or rotating key).

### Phase V2.4 — UX & Pencil

- **Implemented (partial)**: **Settings → Federation** tab — link status (phase, effective peers, secret, allowlist), **WAN / manifest** card (static + manifest counters, sync, `/.well-known/hive-mesh.json` link), **directory** (`GET /api/mesh/federation/directory`) with Agent Card links, transport summary, **probe** + **manifest diagnostic** (operator). The **A2A / mesh** tab links to Federation for details; **Settings → A2A** also displays **public identity / API keys / reputation / bootstrap** mesh (V2.3) when configured.
- Full visual alignment with `pencil-new.pen` (v1 deviation accepted in `MESH_V1_DONE`) — remains a separate design effort.

---

## 4. Relationship with the current code

- **To reuse**: `@hive/a2a-sdk`, `mesh-events` / `mesh-envelope`, `mesh.a2a.*` logs, `MESH_BUS_HMAC_SECRET`, HTTP correlation.
- **To add**: **gateway** process (or sidecar service) for WAN — rarely in the sole Next.js thread.
- **Not to break**: **v1-only** deployments (one VM, one Redis) must continue without V2 config.

---

## 5. V2 success criteria (draft)

1. Two teams on two continents can establish a **verified A2A channel** without sharing the same Postgres database.
2. An agent can **discover** (via directory) the card of a third-party agent **without** prior access to the other's Redis.
3. Operators can **revoke** a federated link without redeploying the entire mesh.
4. Audit: every **cross-domain delegation** leaves a trace in the Postgres audit log (`audit_logs`) — actions **`mesh.federation.proxy_jsonrpc`** (operator outbound proxy) and **`mesh.federation.inbound_jsonrpc`** (inbound authenticated federation JSON-RPC, after handler execution).

---

## 6. References

- [`TECH_VISION.md`](./TECH_VISION.md) — Layer 2 Agent Mesh, Layer 4 protocols, Layer 5 security.
- [`MESH_V1_DONE.md`](./MESH_V1_DONE.md) — **v1 closed** status (local promise).
- [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md) — current entry point.
- [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md) — **traceability** doc ↔ schemas ↔ code ↔ milestones P1–P6.
- [`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md) — global directory draft spec (P1).
- [`MESH_PLANETARY_P2_WAN_GATEWAY.md`](./MESH_PLANETARY_P2_WAN_GATEWAY.md) — WAN gateway draft ADR (P2).
- [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json) — P1 JSON Schema.
- [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) — registry read OpenAPI (draft).
- [`openapi/gateway-v1.yaml`](./openapi/gateway-v1.yaml) — P2 ingress gateway OpenAPI (draft).
- [`schemas/hive-mesh-descriptor-v1.schema.json`](./schemas/hive-mesh-descriptor-v1.schema.json) — JSON Schema for the `/.well-known/hive-mesh.json` public descriptor.
- [`openapi/hive-mesh-well-known.yaml`](./openapi/hive-mesh-well-known.yaml) — OpenAPI for this public GET.
- [`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md) — WAN transport P3 ADR (NATS JetStream MVP).
- [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml) — HTTP → bus bridge OpenAPI (P3).

---

*Living document — prioritize phases based on your first use case (multi-region enterprise vs public mesh). To explicitly target **planetary** scope, chain **P1→P3** (directory + gateway + transport) before investing heavily in **P4 DHT**.*
