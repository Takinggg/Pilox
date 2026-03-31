# "Open" A2A (public JSON-RPC) — Hive

> **Status**: MVP **opt-in**, **disabled by default**. Builds on phase **V2.3** ([`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md)): public mesh, identity, reputation — here only the **narrowest possible transport building block**.

## What already exists without auth

- **`GET /.well-known/agent-card.json`** — discovery metadata (no secret).
- **`GET /.well-known/hive-mesh.json`** — mesh / federation descriptor (safe fields); **`meshV2`** aligned with federation status; if public JSON-RPC is active, **`a2a.publicTier`** exposes booleans **`reputationCounters`** / **`reputationBlock`** / **`scopesEnabled`** (at least one key with `token|methods` — no secrets). JSON Schema: [`schemas/hive-mesh-descriptor-v1.schema.json`](./schemas/hive-mesh-descriptor-v1.schema.json).

## What "public JSON-RPC" adds

Under **`A2A_PUBLIC_JSONRPC_ENABLED=true`**, `POST /api/a2a/jsonrpc` accepts **without session or token** requests whose JSON-RPC method appears in **`A2A_PUBLIC_JSONRPC_ALLOWED_METHODS`** (comma-separated list, **required** if the flag is active). **Alias**: **`POST /api/a2a/jsonrpc/public`** — same handler, same policy (dedicated path for firewall / operator documentation).

- Log / audit identity: **`hive-public-a2a`**.
- **Dedicated Redis rate limit**: prefix **`hive:rl:public_a2a`**, key **`ip:<clientIp>`** — **separate** from the authenticated A2A quota and federation.
- **Per-identity rate limit (optional)**: if **`A2A_PUBLIC_JSONRPC_IDENTITY_HEADER`** is set (e.g., `X-Hive-Public-Identity`), the header value is **SHA-256 hashed** and used as a second Redis bucket **`hive:rl:public_a2a_id:id:<hash>`** (`A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_*`). The **IP** ceiling always applies first; without a header or with an empty value → **IP only**.
- **Reputation (opt-in)**: **`A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED=true`** increments Redis counters **`hive:mesh:pub_rep:{ok|rate_limited|rpc_error}:<hash>`** (best-effort) — key = **API key** hash if present, otherwise **identity header** hash; without either, no per-peer counter (IP only). **Blocking (opt-in)**: **`A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED=true`** (also requires **`REPUTATION_ENABLED`**) denies the public tier with **HTTP 429** / JSON-RPC **`-32005`** when **`rate_limited` + `rpc_error` >= `A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD`** (default 100). **`A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS`** feeds **`Retry-After`** (default 3600). Redis unavailable → **fail-open** (no blocking).
- **Public API keys (optional)**: **`A2A_PUBLIC_JSONRPC_API_KEYS`** — tokens **32–512** characters. **Without scopes**: multiple tokens separated by **commas** (legacy). **With per-key scopes**: use the **`;`** separator between entries; each entry is **`token|method1,method2`** (methods ⊆ **`A2A_PUBLIC_JSONRPC_ALLOWED_METHODS`**, validated at boot). Example: `tokA|tasks/list;tokB|tasks/list,tasks/get`. Client: **`X-Hive-Public-A2A-Key`** or **`Authorization: Bearer`** after Hive auth failure; **timing-safe** matching; quota **`hive:rl:public_a2a_apikey`**. **`A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY`** → token required (**401**). Invalid token → **401**. Method outside scope for a scoped key → **401**.
- Decision order: **federation** → **Hive auth** (session / Bearer / internal) → **otherwise** public branch if method is allowed.

## Threats (summary)

| Risk | Delivered mitigation |
|------|----------------------|
| Volumetric abuse | Dedicated Redis window, low ceiling by default (see `.env.example`). **429** response in **JSON-RPC format** (code **`-32005`**, `error.data.retryAfterSeconds` / `limit`) + **`X-RateLimit-*`** / **`Retry-After`** headers. |
| **Dangerous methods** exposed | **Explicit allowlist** only; no methods by default in the code. |
| Data leak via RPC | **Operator's responsibility**: only allow methods whose semantics are acceptable without identity (often **none** on a control plane). |
| Enumeration | **401** response if method is not in the list (no detail about whether the method exists on the auth side). |
| Malformed body | Treated as "public" requests if public mode is active: **same rate-limit bucket**, then **400**/**413** JSON-RPC response **immediately** (without executing the full JSON-RPC pipeline). |

## Non-goals (this iteration)

- No DHT / peer-to-peer relay (see **`MESH_PUBLIC_MESH_BOOTSTRAP_URLS`** for a static list of `hive-mesh.json` URLs in the public descriptor).
- No "social" reputation / W3 DIDs — only opt-in **Redis counters** and optional **threshold-based blocking** (no collaborative scoring or VCs).
- No list of "recommended" methods in the product code — **documentation + runbook** only.

## Environment variables

See **`app/.env.example`**: `A2A_PUBLIC_JSONRPC_*`.

The **429** contract (HTTP + JSON-RPC code **`-32005`**) is also exposed in **`GET /api/a2a/status`** under **`publicJsonRpc.rateLimitedResponse`** (UI / generated clients). The same endpoint exposes **`meshV2`** (WAN mesh contract version, aligned with **`hive-mesh.json`** and federation).

**OpenTelemetry (metrics)**: counter **`hive.mesh.a2a.public_tier.decisions_total`** with attribute **`mesh.a2a.public_tier.decision`**: `unauthorized_invalid_key` · `unauthorized_required_key` · `unauthorized_scope` · `parse_rejected` · `invalid_method` · `reputation_blocked` — incremented on paths **before** the shared handler (401 / 4xx early / 429 reputation). Calls that reach the handler remain on **`hive.mesh.a2a.rpc.duration_ms`** (including **`hive.entrypoint`** when applicable). Public Redis **rate limit** denials are on **`hive.mesh.rate_limit.blocked_total`** (`mesh.rate_limit.tier` = `public_a2a` / `public_a2a_identity` / `public_a2a_api_key`). If **`A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED`**, each successful Redis **`INCR`** on **`hive:mesh:pub_rep:*`** also emits **`hive.mesh.a2a.public_reputation.events_total`** (`mesh.a2a.public_reputation.kind` = `ok` · `rate_limited` · `rpc_error`).

## Operator checklist before activation

1. **`A2A_ENABLED=true`**.
2. Read the **exact** semantics of each allowed method in your version of the SDK / executor.
3. Start with a **low ceiling** (e.g., 30 req/min/IP) and monitor Redis / `mesh.a2a.*` logs and **`mesh.a2a.public_tier.*`** (public tier entry, parse / method rejections, **`rate_limited`** with `limit` / `retryAfterMs`). Field **`entrypoint`**: `main` · `public_alias` · `federated_alias` — on **`mesh.a2a.public_tier.*`**, **`mesh.a2a.rpc.*`** (including **`hive-public-a2a`** and **`hive-federated`** calls), and audit **`mesh.federation.inbound_jsonrpc`**.
4. Prefer **federation** or **standard auth** for anything involving tasks or user data.

## Operator runbook — keys, scopes, rotation

- **Syntax**: as soon as a **`|`** appears in the value, **entries** are separated by **`;`**. Otherwise, stick with the legacy **comma** mode = one token per segment (no scope). Do not mix by mistake: a line with `|` requires `;` between multiple keys.
- **Global consistency**: each method listed after `|` must also appear in **`A2A_PUBLIC_JSONRPC_ALLOWED_METHODS`** — startup rejects an invalid config.
- **Zero-downtime rotation**: add the **new** entry **before** removing the old one (two active tokens in the same variable), restart / deploy, migrate clients to the new key, then remove the old entry.
- **Visibility**: **`GET /api/a2a/status`** exposes **`publicJsonRpc.apiKeys.scopesEnabled`** (`true` if at least one key has explicit scopes) — useful to verify you are indeed in per-key restricted mode.
- **401 on the client side** (responses are intentionally terse): token absent when **`A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY=true`**; unknown or miscoped token; JSON-RPC method **not in** the global allowlist; or, with a **scoped** key, method **not listed** for that key. Check the method in the request body first, then the env variable.
- **429 reputation**: if reputation blocking is active, a peer (key hash or identity) with too many **`rate_limited`** / **`rpc_error`** events receives the same JSON-RPC response as standard rate limiting; lower the threshold or purge the Redis keys **`hive:mesh:pub_rep:*`** on the operator side if needed.

## Possible evolutions

- **Done**: per-key **scopes** (`token|m1,m2` + `;` separator between entries when `|` is present).
- **Done**: second Redis bucket **`hive:rl:public_a2a_id`** if **`A2A_PUBLIC_JSONRPC_IDENTITY_HEADER`**; **`hive:rl:public_a2a_apikey`** if **`A2A_PUBLIC_JSONRPC_API_KEYS`**; **`A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY`**; counters **`hive:mesh:pub_rep:*`** + opt-in blocking **`A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_*`**; **`MESH_PUBLIC_MESH_BOOTSTRAP_URLS`** in **`/.well-known/hive-mesh.json`** (`publicMesh.bootstrapMeshDescriptorUrls`).
- **Done**: alias **`POST /api/a2a/jsonrpc/public`** (same handler).
- **Done**: **`entrypoint`** field on `mesh.a2a.public_tier.*` and on **`mesh.a2a.rpc.*`** (request / complete / stream) for **`hive-public-a2a`** calls — log correlation / future OTel metrics.
- **Partial**: early-tier counters **`hive.mesh.a2a.public_tier.decisions_total`** and Redis reputation **`hive.mesh.a2a.public_reputation.events_total`**; RPC duration + rate limit already exposed (see above).
