# Federated Mesh — Runbook (Two Hive Instances)

Concise procedure for **pairing** two (or N) Hive deployments with the transport documented in [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md). Prerequisites: valid TLS (or explicit HTTP in lab), **Redis** for federated rate limits **and** **`jti`** consumption (JWT anti-replay) if JWT federation is used with **`MESH_FEDERATION_JWT_REQUIRE_JTI=true`** (default), **A2A enabled** on both sides.

---

## 1. Variables to Align

| Variable | Purpose |
|----------|---------|
| `MESH_FEDERATION_ENABLED` | `true` on each participating node. |
| `MESH_FEDERATION_PEERS` | List of **origins** of the **other** nodes (comma-separated), e.g. `https://hive-a.example,https://hive-b.example`. Order = **`peerIndex`** of the proxy (static first; see manifest). |
| `MESH_FEDERATION_MAX_PEERS` | Cap after merging static + manifest (default **512**, max **8192**). |
| `MESH_FEDERATION_PEERS_MANIFEST_URL` | Optional. HTTPS URL of a signed JSON (see [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §V2.2.1) listing additional peers — useful for a **global roster** managed by an org Ed25519 key. |
| `MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX` | 64 hex: Ed25519 public key that signs the manifest `payload` (required if the URL is defined). |
| `MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS` | Cache TTL / manifest re-fetch (default **300**). |
| `MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS` | HTTP timeout for the manifest fetch (default **15000**). |
| `MESH_FEDERATION_SHARED_SECRET` | **Same** string ≥ 32 characters on **all** paired nodes (vault, planned rotation). |
| `MESH_FEDERATION_RATE_LIMIT_*` | Optional; default 100 req / 60 s (Redis window **dedicated** to federation). |
| `MESH_FEDERATION_JWT_TTL_SECONDS` | Optional; default **300** (30–3600). Lifetime of the JWT minted by the operator proxy. |
| `MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS` | Optional; default **60** (0–300). `exp` / `iat` leeway on inbound JWT verification (clock drift between nodes). **0** = strict. |
| `MESH_FEDERATION_JWT_AUDIENCE` | Optional. If non-empty: value required for the JWT **`aud`** claim (otherwise defaults to `new URL(AUTH_URL).origin`). Align with the actual public URL if it differs from `AUTH_URL`. |
| `MESH_FEDERATION_PROXY_SEND_SECRET` | Optional; default **`false`**. If **`true`**, the proxy also sends **`X-Hive-Federation-Secret`** (backward compatibility — secret on the wire). |
| `MESH_FEDERATION_JWT_ALG` | **`HS256`** (default, shared secret) or **`Ed25519`** (per-peer keys; see below). |
| `MESH_FEDERATION_ED25519_SEED_HEX` | 64 hex characters (32 bytes). **Local** Ed25519 seed; required for **minting** JWTs on the proxy side if `JWT_ALG=Ed25519`. The derived **public key** appears in the federation status so that peers can add it to their env. |
| `MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS` | Ed25519 public keys (64 hex each), **comma-separated**, in the **same order** as the origins parsed from `MESH_FEDERATION_PEERS`. Required if federation is enabled and `JWT_ALG=Ed25519`. |
| `MESH_FEDERATION_PROXY_OPERATOR_TOKEN` | Optional, ≥32 characters. If defined, `POST .../proxy/jsonrpc` also requires the **`X-Hive-Federation-Proxy-Operator-Token`** header (in addition to the operator role). |
| `MESH_FEDERATION_JWT_REQUIRE_JTI` | Optional; default **`true`**. If **`true`**, any inbound JWT must contain the **`jti`** claim (otherwise rejected). |
| `MESH_FEDERATION_JWT_REQUIRE_AUDIENCE` | Optional; default **`true`**. If **`true`**, the JWT must contain **`aud`** equal to the expected origin for this instance (`AUTH_URL` or **`MESH_FEDERATION_JWT_AUDIENCE`**). |
| `MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET` | Optional; default **`true`**. If **`false`**, authentication by **`X-Hive-Federation-Secret` alone** is refused (**403**) — only use when all peers send a JWT with **`jti`**. |
| `MESH_FEDERATION_INBOUND_ALLOWLIST` | Optional. If non-empty: only these addresses (exact IPv4, `IPv4/prefix`, or exact string e.g. full IPv6) may use inbound federated authentication (**`X-Hive-Federation-JWT`** or legacy secret). The client IP follows **`HIVE_CLIENT_IP_SOURCE`** (same as public A2A RL) — see [`PRODUCTION.md`](./PRODUCTION.md) §4.1. |

Also verify: `AUTH_URL`, `A2A_ENABLED=true`, outbound network allowed to peer origins (firewall).

---

## 2. Verifications (Without UI)

1. **Indexed directory** (session or token **viewer+**):
   `GET /api/mesh/federation/directory`
   → `peers[].peerIndex`, `origin`, `agentCardUrl` (list = static + manifest merged, same as the proxy — no HTTP call from the directory endpoint).

2. **Operator probe** (cookie or token **operator+**):
   `GET /api/mesh/federation/status?probe=1`
   → `probe[]` with HTTP / latency to `/.well-known/agent-card.json` of each peer (origins = static + manifest merged).

   Optional: **`GET /api/mesh/federation/status?debug_manifest=1`** (operator+) → **`manifestDebug.manifestLastError`**: safe token (`http_404`, `fetch_timeout`, …) or **`unknown`**, no free-text network/DNS data.

3. **Local agent card**:
   `GET /.well-known/agent-card.json` on each instance.

4. **Public mesh descriptor (WAN discovery)**:
   `GET /.well-known/hive-mesh.json` (no auth) — JSON `hive-mesh-descriptor-v1` with A2A links + federation / `wanMesh` summary.

5. **Postgres audit** (`audit_logs`, retention per your policy):
   - **`mesh.federation.proxy_jsonrpc`** — each relay via `POST /api/mesh/federation/proxy/jsonrpc` (operator user if `userId` known, `resourceId` = target peer origin, upstream HTTP status, `correlationId`).
   - **`mesh.federation.inbound_jsonrpc`** — each response returned after an authenticated federation **`POST`** on **`/api/a2a/jsonrpc`**, **`/api/a2a/jsonrpc/public`** or **`/api/a2a/federated/jsonrpc`**: JSON-RPC method (preview), HTTP status, auth mode, `jwtIss` (peer origin in **Ed25519**; constant issuer in **HS256**), `entrypoint` (`main` / `public_alias` / `federated_alias`), normalized client IP.

---

## 3. Peer-to-Peer JSON-RPC Test (Lab)

**Recommended**: go through the **operator proxy** (next section) — the server mints a short **`X-Hive-Federation-JWT`** with **`aud`**, **`jti`**, and only sends the legacy secret if **`MESH_FEDERATION_PROXY_SEND_SECRET=true`**.

**Direct to B** with the legacy secret (`hive-federated` identity on B side) — **do not** send JWT and secret on the same request. Same handler as **`POST /api/a2a/jsonrpc`**: you can target **`POST /api/a2a/federated/jsonrpc`** for a dedicated ingress policy (firewall / docs).

```bash
curl -sS -X POST "$HIVE_B/api/a2a/jsonrpc" \
  -H "Content-Type: application/json" \
  -H "X-Hive-Federation-Secret: $MESH_FEDERATION_SHARED_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}'
```

**Operator proxy on A** (session or operator token, JSON body) — `peerIndex` = rank of **B** in A's `MESH_FEDERATION_PEERS`:

```bash
curl -sS -X POST "$HIVE_A/api/mesh/federation/proxy/jsonrpc" \
  -H "Content-Type: application/json" \
  -H "Cookie: …" \
  -d '{"peerIndex":0,"rpc":{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}}'
```

---

## 4. Common Incidents

| Symptom | Lead |
|---------|------|
| 401 on JSON-RPC with federation header | Different secret or < 32 chars; federation disabled on the target; **replay** of the same JWT (**`jti`** already consumed); JWT without **`jti`** while **`MESH_FEDERATION_JWT_REQUIRE_JTI=true`**. |
| 503 JSON-RPC after JWT verification OK | **Redis** unavailable or error during **`jti`** registration — the instance refuses rather than accepting without anti-replay. |
| 403 "legacy secret disabled" | **`MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET=false`** and request with secret only — switch to JWT (operator proxy or aligned mint). |
| 403 JSON-RPC | `A2A_JSONRPC_MIN_ROLE=admin` on the target — the federated peer is treated as **operator**. |
| 403 "not in …ALLOWLIST" | IP seen by Hive differs from the actual peers — verify proxy headers and the `MESH_FEDERATION_INBOUND_ALLOWLIST` list. |
| 429 | Federated rate limit (`hive:rl:federation:*`) or generic A2A; check Redis. |
| 503 on proxy | `A2A_ENABLED=false`, federation off, or transport not ready (HS256: secret; Ed25519: seed + peer keys aligned). |
| 403 on proxy "Proxy-Operator-Token" | `MESH_FEDERATION_PROXY_OPERATOR_TOKEN` is defined but the header does not match. |

---

## 5. Shared Secret Rotation

1. Generate a new value ≥ 32 characters.
2. Update **simultaneously** (short window) on **all** paired nodes.
3. Calls with the old secret fail immediately after switchover — plan automatic retry on the client side if applicable.

**JWT**: rotating the **`MESH_FEDERATION_SHARED_SECRET`** immediately invalidates JWTs still unexpired and signed with the old key. Already consumed **`jti`** entries remain in Redis until the TTL key expires (aligned with the token's **`exp`**) — no manual purge needed during secret rotation. After switchover, only new JWTs (operator proxy or external mint aligned with the new key) are accepted.

**Clock**: verification uses **`MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS`** (default **60**, max **300**, **0** = strict) for `exp` / `iat`; aim for **NTP** on VMs if possible.

---

## 6. Revoking a Link (Without Redeploying the Entire Mesh)

1. **Statically listed peer**: remove its origin from **`MESH_FEDERATION_PEERS`** on the nodes that should no longer trust it, then apply the config (standard process: targeted restart / redeploy).
2. **Peer from the manifest**: remove the entry from **`payload.peers`** on the manifest publication side; after at most **`MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS`** (+ Redis / L1 caches), the effective roster updates — no need to touch other instances for the "whole" product.
3. **Ed25519**: remove the peer's **public key** from **`MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS`** (same order as origins) to cut off signature verification without changing the rest of the mesh.

---

## 7. Centralized policy (optional org-wide)

For fleets that want **policy** (roster, publish rules, gateway posture) versioned **above** raw env vars, see **[`MESH_CENTRALIZED_POLICY.md`](./MESH_CENTRALIZED_POLICY.md)** — MVP = GitOps env; later = signed bundles / OPA. Federation **pairing steps** in this runbook are unchanged.

---

## 8. References

- [`PRODUCTION.md`](./PRODUCTION.md) — RBAC / routes matrix.
- [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md) — A2A routes.
- [`PETIT_GROS_AUDIT.md`](./PETIT_GROS_AUDIT.md) — federation surface + rate limit.
- [`MESH_OBSERVABILITY.md`](./MESH_OBSERVABILITY.md) — OpenTelemetry (mesh traces / metrics).
- [`MESH_GATEWAY_WAN.md`](./MESH_GATEWAY_WAN.md) — WAN reverse-proxy.
- [`MESH_MTLS.md`](./MESH_MTLS.md) — inter-instance mTLS (PKI / SPIFFE).
- [`MESH_CENTRALIZED_POLICY.md`](./MESH_CENTRALIZED_POLICY.md) — policy distribution + audit (architecture).

---

## 9. Design Notes (Audit — Non-Blocking)

- **`req.clone()` + body peek**: each JSON-RPC `POST` clones the body for method preview / public branch before the handler. Negligible impact as long as **`A2A_JSONRPC_MAX_BODY_BYTES`** stays in the MB range.
- **Public allowlist cache** (`publicA2aAllowedMethodSet`): in-memory singleton per env string — consistent with a **process-wide** env that is immutable between restarts; a hot-reload of env **without** a restart could theoretically serve a stale set in dev.
- **Postgres fire-and-forget audit** (`mesh.federation.*`): does not block the RPC response; insert failure → error log only. Acceptable for latency; **OTel metrics** (`hive.mesh.*`, see [`MESH_OBSERVABILITY.md`](./MESH_OBSERVABILITY.md)) cover RPC latency and Redis rate limit saturation — no dedicated span per audit insert yet.
