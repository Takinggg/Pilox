# Hive — LLM/AI Inference Optimization (Docker-first)

> Technical architecture, implementation, Redis schema, API, security, async proxy.
> **Goal: 3-5x more agents on the same hardware.**

This document applies to the **Docker deployment**: the “host inference service” (Ollama/vLLM) runs alongside Hive, and agent runtimes (Docker / microVM) connect to it.

Some sections mention **appliance/systemd** paths (e.g. `hive-redis.service`, `hive.env.template`, `first-boot.sh`). For a **Docker-only** install, treat those as *implementation examples* and configure the equivalent via **Compose/Kubernetes env + container args** instead.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1: Agent Sleeping (VM Pause/Resume)](#2-phase-1--agent-sleeping)
3. [Phase 2: Smart Proxy (Async + Redis)](#3-phase-2--smart-proxy)
4. [Phase 3: Quantization Routing](#4-phase-3--quantization-routing)
5. [Phase 4: Prompt Caching / Pre-warming](#5-phase-4--prompt-caching--pre-warming)
6. [Phase 5: vLLM Integration](#6-phase-5--vllm-integration)
7. [Phase 6: Observability](#7-phase-6--observability)
8. [Full Redis Schema](#8-full-redis-schema)
9. [API Reference](#9-api-reference)
10. [DB Schema (New Tables/Columns)](#10-db-schema)
11. [Security & Hardening](#11-security--hardening)
12. [Configuration](#12-configuration)
13. [Modified/Created Files](#13-modified-created-files)
14. [Startup & Lifecycle](#14-startup--lifecycle)

---

## 1. Overview

### Architecture

```
Agent VM (Firecracker)
  └─ socat: localhost:11434 → vsock CID 2:11434
       └─ hive-vsock-proxy (asyncio, vsock :11434)
            ├─ Endpoint allowlist
            ├─ Rate limiting (120 req/60s/VM)
            ├─ Tier concurrency (low:2, medium:5, high:10)
            ├─ Auto-resume (agent paused → wake + forward)
            ├─ Activity tracking (Redis)
            ├─ Token counting (NDJSON parse)
            └─ Forward → Ollama/vLLM (127.0.0.1:11434)
```

### Gains per Phase

| Phase | Optimization | Estimated Gain |
|-------|-------------|----------------|
| 1 | Agent Sleeping | 10 agents, 3 active → 70% RAM CPU freed |
| 2 | Smart Proxy | Foundation for all other optimizations |
| 3 | Quantization Routing | Q4=2GB vs FP16=8GB → 2-3x more simple agents |
| 4 | Prompt Caching | Shared system prompts → 10x less reprocessing |
| 5 | vLLM | Prefix caching + continuous batching + speculative decoding |
| 6 | Observability | Tokens/h, VRAM, cache hit rate, per-agent usage |

---

## 2. Phase 1: Agent Sleeping

### Concept

Firecracker natively supports `PATCH /vm {"state":"Paused"}` / `{"state":"Resumed"}`. The vCPUs are frozen, RAM remains resident. Resume ~125ms.

An agent idle for 5min (configurable) is auto-paused. When an inference request arrives, the proxy wakes it up automatically.

### Firecracker API

```typescript
// app/src/lib/firecracker.ts

export async function pauseVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(JAILER_CHROOT_BASE, "firecracker", vmId, "root", "firecracker.sock");
  await firecrackerAPI(socketPath, "PATCH", "/vm", { state: "Paused" });
}

export async function resumeVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(JAILER_CHROOT_BASE, "firecracker", vmId, "root", "firecracker.sock");
  await firecrackerAPI(socketPath, "PATCH", "/vm", { state: "Resumed" });
}
```

### Runtime Abstraction

```typescript
// app/src/lib/runtime.ts
export const pauseInstance = pauseVM;
export const resumeInstance = resumeVM;
```

### API Routes

**POST /api/agents/{id}/pause** (operator)
1. Verify status === "running"
2. `pauseInstance(agent.instanceId)`
3. DB: status → "paused"
4. Redis: `SET hive:agent:paused:{id} 1 EX 86400`
5. Publish events (`agent.paused`)
6. Audit log

**POST /api/agents/{id}/resume** (operator)
1. Verify status === "paused"
2. `resumeInstance(agent.instanceId)`
3. DB: status → "running"
4. Redis: `DEL hive:agent:paused:{id}`
5. Publish events (`agent.resumed`)
6. Audit log

### Idle Detector

```typescript
// app/src/lib/idle-detector.ts

export function startIdleDetector(): void  // Called at startup
export function stopIdleDetector(): void   // Called at shutdown

// Constants
CHECK_INTERVAL_MS = 30_000       // Checks every 30s
DEFAULT_IDLE_THRESHOLD_S = 300   // 5 minutes without activity → pause
```

**Logic:**
1. Query DB: all agents with `status = "running"`
2. For each agent: read `hive:agent:activity:{id}` from Redis
3. If no activity record → grace period (set timestamp, skip)
4. If `idle > threshold` → `pauseVM()` + update DB + Redis flag + events

**Env config:**
- `AUTO_SLEEP_ENABLED=true|false`
- `AUTO_SLEEP_IDLE_SECONDS=300`

### Auto-Resume (Proxy Side)

When the proxy receives a request from a paused agent:
1. Read `hive:agent:paused:{agentId}` from Redis
2. POST `{HIVE_API_URL}/api/agents/{id}/resume` with `Bearer HIVE_INTERNAL_TOKEN`
3. Wait 150ms (Firecracker wake time)
4. Forward the request normally

### Frontend

3 button states on the agent detail page:
- **running** → Pause (yellow) + Stop (red)
- **paused** → Resume (green) + Stop (red)
- **stopped/created/error** → Start (green)

Paused badge: yellow dot `#EAB308`, bg `#EAB3081A`.

### CID → agentId Mapping

The proxy sees CIDs (vsock integers), not UUIDs. The mapping is done via Redis:

```typescript
// At agent start:
const vmMeta = await getVMMetadata(agent.instanceId);
await r.set(`hive:vm:cid:${vmMeta.vsockCID}`, agentId, "EX", 86400);

// At stop:
const vmMeta = await getVMMetadata(agent.instanceId);
await r.del(`hive:vm:cid:${vmMeta.vsockCID}`);
```

---

## 3. Phase 2: Smart Proxy

### Async Architecture

The proxy is rewritten in pure **asyncio** (zero threads). Handles 200+ concurrent connections on a single event loop.

```python
# os/scripts/hive-vsock-proxy.py

async def main():
    await init_redis()                         # redis.asyncio
    server = socket.socket(AF_VSOCK, SOCK_STREAM)
    server.listen(256)
    server.setblocking(False)

    loop = asyncio.get_running_loop()
    while not shutdown_event.is_set():
        client, addr = await loop.sock_accept(server)
        asyncio.create_task(handle_connection(client, peer_cid))
```

### Connection Handler Flow

```
1. loop.sock_recv() — Read HTTP headers
2. Parse request line (method, path)
3. Endpoint allowlist check → 403
4. Rate limit check → 429
5. Body size check → 413
6. Read remaining body
7. Parse JSON body (model, prompt)
8. Auto-resume if paused
9. Track activity in Redis
10. Tier concurrency check → 503
11. asyncio.open_connection() → upstream
12. Stream response + capture for token counting
13. Count tokens (NDJSON parse)
14. Track tokens in Redis
15. Release tier slot
```

### Allowed Endpoints

```python
OLLAMA_ENDPOINTS = {
    ("POST", "/api/generate"),
    ("POST", "/api/chat"),
    ("POST", "/api/embeddings"),
    ("POST", "/api/embed"),
    ("GET", "/api/tags"),
    ("POST", "/api/show"),
    ("GET", "/api/version"),
    ("GET", "/"),
}

VLLM_ENDPOINTS = {
    ("POST", "/v1/chat/completions"),
    ("POST", "/v1/completions"),
    ("POST", "/v1/embeddings"),
    ("GET", "/v1/models"),
}
```

Everything else is blocked (no `DELETE /api/delete`, no `POST /api/pull`, etc.).

### Rate Limiting

Sliding window, 120 requests / 60 seconds per CID. In-memory (not Redis) for zero latency.

### Tier Concurrency

```python
TIER_CONCURRENCY = {
    "low": 2,       # Max 2 simultaneous inference requests
    "medium": 5,
    "high": 10,
}
```

The tier is read from Redis: `hive:agent:tier:{cid}`.

### Token Counting

Parses the NDJSON stream from Ollama to extract `prompt_eval_count` and `eval_count`:

```python
def count_tokens_in_response(response_data: bytes) -> tuple[int, int]:
    for line in response_data.split(b"\n"):
        obj = json.loads(line)
        tokens_in += obj.get("prompt_eval_count", 0)
        tokens_out += obj.get("eval_count", 0)
    return tokens_in, tokens_out
```

Stored in Redis hash: `HINCRBY hive:agent:tokens:{agentId} input/output`.

### Token Sync Daemon

```typescript
// app/src/lib/token-sync.ts
// Every 60s: Redis → PostgreSQL

async function syncTokens(): Promise<void> {
  const keys = await scanKeys("hive:agent:tokens:*");  // SCAN, not KEYS
  for (const key of keys) {
    const counters = await r.hgetall(key);
    await r.del(key);  // Atomic reset
    await db.insert(inferenceUsage).values({ agentId, model, tokensIn, tokensOut });
    await db.update(agents).set({
      totalTokensIn: sql`COALESCE(total_tokens_in, 0) + ${tokensIn}`,
      totalTokensOut: sql`COALESCE(total_tokens_out, 0) + ${tokensOut}`,
    });
  }
}
```

---

## 4. Phase 3: Quantization Routing

### Concept

A "low" tier agent does not need FP16. It is automatically routed to Q4_0 (2GB VRAM).

```typescript
// app/src/lib/model-router.ts

const TIER_QUANT_MAP: Record<string, string[]> = {
  low:    ["q4_0", "q4_K_M", "q4_K_S"],     // 2GB VRAM
  medium: ["q8_0", "q5_K_M", "q5_K_S"],     // 4-5GB VRAM
  high:   ["f16", "q8_0"],                    // 8GB+ VRAM
};
```

### Functions

```typescript
export function resolveModel(
  requestedModel: string,    // "llama3.2"
  tier: string,              // "low"
  availableModels: string[]  // ["llama3.2:q4_0", "llama3.2:q8_0", ...]
): string                    // → "llama3.2:q4_0"

export async function getAvailableModels(): Promise<string[]>
// Redis cache: hive:models:available (TTL 300s)

export async function refreshAvailableModels(): Promise<string[]>
// Fetch /api/tags, cache result
```

---

## 5. Phase 4: Prompt Caching / Pre-warming

### Prompt Cache

Agents with the same system prompt share the same prefix KV cache in vLLM.

```typescript
// app/src/lib/prompt-cache.ts

export function hashPrompt(systemPrompt: string): string
// SHA-256, truncated to 16 hex chars

export async function registerAgentPrompt(agentId: string, systemPrompt: string): Promise<string>
// Redis: agent → hash, hash → prompt, agents set

export async function unregisterAgentPrompt(agentId: string): Promise<void>
// Cleanup on stop/delete

export async function getPromptShareCount(systemPrompt: string): Promise<number>
// How many agents share this prompt
```

**Redis keys:**
- `hive:agent:prompt:{agentId}` → hash (24h TTL)
- `hive:prompt:{hash}` → full prompt text (24h TTL)
- `hive:prompt:agents:{hash}` → SET of agentIds

### Prompt Warmer

At agent start/resume, pre-loads the system prompt into the KV cache:

```typescript
// app/src/lib/prompt-warmer.ts

export async function prewarmAgent(agentId: string, config: Record<string, unknown>): Promise<void>
// Sends: POST /api/generate { model, system: systemPrompt, prompt: ".", options: { num_predict: 1 } }
// Non-blocking, errors logged but not propagated
// Result: first real request ~10x faster
```

**Agent config:**
```json
{
  "systemPrompt": "You are a customer service agent...",
  "prewarmOnStart": true,
  "model": { "name": "llama3.2:q8_0" }
}
```

---

## 6. Phase 5: vLLM Integration

### systemd Service

```ini
# os/config/.../hive-inference-vllm.service

ExecStart=/usr/local/bin/python3 -m vllm.entrypoints.openai.api_server \
  --model /var/lib/hive/models/default \
  --host 127.0.0.1 \
  --port 11434 \
  --enable-prefix-caching \       # Shared KV cache
  --enable-chunked-prefill \      # Better batching
  --max-num-seqs 64 \             # Continuous batching
  --gpu-memory-utilization 0.90   # 90% VRAM
```

Security: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`.

### Backend Switcher

```typescript
// app/src/lib/inference-backend.ts

export type InferenceBackend = "ollama" | "vllm";

const SERVICE_MAP = {
  ollama: "hive-inference",
  vllm: "hive-inference-vllm",
};

export async function getActiveBackend(): Promise<InferenceBackend>
// systemctl is-active --quiet hive-inference-vllm → "vllm", otherwise "ollama"

export async function getBackendStatus(): Promise<{
  backend: InferenceBackend;
  running: boolean;
  models: string[];
}>

export async function switchBackend(target: InferenceBackend): Promise<boolean>
// 1. systemctl stop current
// 2. systemctl disable current
// 3. systemctl enable target
// 4. systemctl start target
// 5. Health check (30 retries × 2s = 60s timeout)
// 6. Redis: SET hive:inference:backend target
// 7. On failure → restore previous backend
```

### API

**GET /api/system/inference** → `{ backend, running, models }`

**POST /api/system/inference** (admin) → `{ backend: "vllm" }` → switch

The proxy and agents see no difference: same port 11434.

---

## 7. Phase 6: Observability

### Stats API

**GET /api/system/inference/stats** (viewer)

```typescript
{
  backend: "vllm" | "ollama",
  tokensLastHour: { totalIn, totalOut, requests },
  tokensLastDay: { totalIn, totalOut, requests },
  topAgents: [{ id, name, tokensIn, tokensOut, tier, status }],  // Top 10
  vram: {
    gpus: [{ index, name, totalMB, usedMB, freeMB }],
    totalMB, usedMB
  },
  activeAgents: number,       // running + paused
  concurrentRequests: number  // activity keys count
}
```

VRAM: `nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free --format=csv`.

### Per-Agent Usage

**GET /api/agents/{id}/usage?period=24h&limit=100** (viewer)

```typescript
{
  agentId, period,
  totals: { tokensIn, tokensOut },
  byModel: [{ model, totalIn, totalOut, count }],
  recent: [{ id, model, tokensIn, tokensOut, durationMs, createdAt }]
}
```

Periods: `1h`, `6h`, `24h`, `7d`, `30d`.

---

## 8. Full Redis Schema

| Key Pattern | Type | Set by | Read by | TTL |
|-------------|------|--------|---------|-----|
| `hive:agent:activity:{agentId}` | STRING (timestamp ms) | Proxy | Idle detector | 600s |
| `hive:agent:paused:{agentId}` | STRING ("1") | Pause route, Idle detector | Proxy (auto-resume) | 86400s |
| `hive:agent:tokens:{agentId}` | HASH {input, output, last_model} | Proxy | Token sync | 86400s |
| `hive:agent:tier:{cid}` | STRING (low/medium/high) | App API (start) | Proxy | 86400s |
| `hive:vm:cid:{cid}` | STRING (agentId) | Start route | Proxy | 86400s |
| `hive:vm:instance:{instanceId}` | STRING (agentId) | Start route | Internal | 86400s |
| `hive:agent:prompt:{agentId}` | STRING (hash) | Prompt cache | Warmer | 86400s |
| `hive:prompt:{hash}` | STRING (full prompt) | Prompt cache | Reference | 86400s |
| `hive:prompt:agents:{hash}` | SET (agentIds) | Prompt cache | Stats | - |
| `hive:models:available` | STRING (JSON array) | Model router | Proxy | 300s |
| `hive:inference:backend` | STRING (ollama/vllm) | Backend switcher | Proxy | - |
| `hive:cache:{key}` | STRING (JSON) | Cache helpers | Any | 60s default |

**Pub/Sub Channels:**
- `hive:agent:status` — AgentStatusEvent
- `hive:agent:logs` — Agent log events
- `hive:system:events` — SystemEvent

---

## 9. API Reference

### Agent Lifecycle

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/agents/{id}/start` | operator | Start the VM |
| POST | `/api/agents/{id}/stop` | operator | Stop the VM |
| POST | `/api/agents/{id}/pause` | operator | Freeze the VM (0% CPU) |
| POST | `/api/agents/{id}/resume` | operator | Unfreeze the VM (~125ms) |
| PATCH | `/api/agents/{id}` | operator | Update tier, model, config |
| GET | `/api/agents/{id}/usage` | viewer | Token usage per agent |

### System Inference

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/system/inference` | viewer | Backend status + models |
| POST | `/api/system/inference` | admin | Switch Ollama ↔ vLLM |
| GET | `/api/system/inference/stats` | viewer | Dashboard data |

### Internal Auth

The proxy uses `Bearer HIVE_INTERNAL_TOKEN` for service-to-service calls (auto-resume). This token is recognized in `authorize.ts` as the `operator` role without a DB lookup.

---

## 10. DB Schema

### New `agents` Fields

```sql
ALTER TABLE agents ADD COLUMN inference_tier inference_tier DEFAULT 'medium';
ALTER TABLE agents ADD COLUMN preferred_model VARCHAR(255);
ALTER TABLE agents ADD COLUMN total_tokens_in INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN total_tokens_out INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN last_active_at TIMESTAMP;
```

### New `inference_usage` Table

```sql
CREATE TABLE inference_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  model VARCHAR(255) NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX inference_usage_agent_id_idx ON inference_usage(agent_id);
CREATE INDEX inference_usage_created_at_idx ON inference_usage(created_at);
```

### Enum

```sql
CREATE TYPE inference_tier AS ENUM ('low', 'medium', 'high');
```

All migrations are additive, nullable/default. Zero downtime.

---

## 11. Security & Hardening

### Critical Bugs Fixed

#### Bug 1: CID → agentId Mapping Broken

**Problem:** The proxy looked up `hive:vm:cid:{cid}` but the start route set `hive:vm:instance:{instanceId}`. CID (vsock integer) ≠ instanceId (VM string).

**Fix:**
- Added `getVMMetadata()` export in `firecracker.ts`
- `createAgentVM` returns `vsockCID` in addition to `vmId` and `ipAddress`
- Start route: `SET hive:vm:cid:{vmMeta.vsockCID} agentId EX 86400`
- Stop route: `DEL hive:vm:cid:{vmMeta.vsockCID}`

#### Bug 2: Internal Token Auth 401

**Problem:** The proxy sent `Bearer HIVE_INTERNAL_TOKEN` for auto-resume, but `authorize("operator")` only knew about JWT sessions and API tokens via DB (SHA-256 hash lookup). The internal token was not in `apiTokens` → always 401.

**Fix in `authorize.ts`:**
```typescript
async function authorizeByToken(token, minimumRole, ip) {
  // Internal check BEFORE DB lookup
  const internalToken = process.env.HIVE_INTERNAL_TOKEN;
  if (internalToken && token === internalToken) {
    return {
      authorized: true,
      session: null,
      user: { id: "system", name: "Hive Internal", email: null },
      role: "operator",
      ip,
    };
  }
  // ... then standard DB lookup
}
```

### Redis KEYS → SCAN

**Problem:** `redis.keys("hive:agent:tokens:*")` blocks Redis on large datasets (atomic O(N)).

**Fix:** `scanKeys()` helper with iterative SCAN:
```typescript
export async function scanKeys(pattern: string, count = 100): Promise<string[]> {
  const result: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", count);
    cursor = nextCursor;
    result.push(...keys);
  } while (cursor !== "0");
  return result;
}
```

Used in: `token-sync.ts`, `stats/route.ts`.

### TTL on All Redis Keys

**Problem:** App crash → permanent orphaned keys (`hive:agent:paused:*`, `hive:vm:cid:*`, etc.).

**Fix:** All lifecycle keys have a 24h TTL (`EX 86400`):
- `hive:vm:cid:{cid}` — start route
- `hive:vm:instance:{instanceId}` — start route
- `hive:agent:paused:{id}` — pause route + idle detector
- `hive:agent:prompt:{agentId}` — prompt cache

### Redis Auth (Password) — Docker

**Problem:** Redis without a password → any process on the host can read/write.

**Fix:**
- Run Redis with `--requirepass ${REDIS_PASSWORD}` (or ACLs), and pass credentials via env/secrets.
- Set `REDIS_URL=redis://:PASSWORD@redis:6379` (parsed by ioredis and redis-py).
- Generate a strong password once (e.g. `openssl rand -hex 32`) and store it in your secrets manager / `docker/.env` (chmod 600).

### Async Proxy (Threading → Asyncio)

**Problem:** `threading` caps out at ~200 concurrent connections (GIL + stack memory per thread).

**Fix:** Complete rewrite in `asyncio`:
- `loop.sock_accept/recv/sendall` for vsock
- `asyncio.open_connection` for upstream TCP
- `redis.asyncio` for non-blocking Redis
- `asyncio.to_thread` for sync HTTP (auto-resume)
- `server.listen(256)` doubled backlog
- Single event loop → thousands of concurrent connections

### Other Security Measures

- **Endpoint allowlist**: only inference endpoints are allowed through the proxy
- **Rate limiting**: 120 req/60s per VM
- **Body size limit**: 16MB max
- **vLLM service hardening**: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`
- **Redis localhost-only**: `-p 127.0.0.1:6379:6379`
- **Jailer**: VMs run under UID 1500, isolated chroot
- **Audit logs**: all pause/resume/start/stop actions are traced

---

## 12. Configuration

### hive.conf [inference]

```ini
[inference]
enabled = auto
backend = ollama
port = 11434
vsock_port = 11434
default_model = llama3.2

auto_sleep_enabled = true
auto_sleep_idle_seconds = 300

token_tracking = true

quantization_routing = false
tier_low_models =
tier_medium_models =
tier_high_models =

vllm_max_sequences = 64
vllm_gpu_memory_util = 0.90
vllm_prefix_caching = true
vllm_speculative_model =
```

### Docker / Compose env (example)

```bash
# Redis
REDIS_URL=redis://:password@redis:6379

# Inference
INFERENCE_BACKEND=ollama
INFERENCE_PORT=11434

# Internal auth (service-to-service)
HIVE_INTERNAL_TOKEN=<generated>

# Agent sleeping
AUTO_SLEEP_ENABLED=true
AUTO_SLEEP_IDLE_SECONDS=300
```

### Proxy Environment Variables

```bash
VSOCK_PORT=11434
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=11434
REDIS_URL=redis://:password@localhost:6379
HIVE_INTERNAL_TOKEN=<auto-generated>
HIVE_API_URL=http://localhost:3000
INFERENCE_BACKEND=ollama
```

---

## 13. Modified/Created Files

### Created Files (12)

| File | Phase | Description |
|------|-------|-------------|
| `app/src/app/api/agents/[id]/pause/route.ts` | 1 | Pause agent API |
| `app/src/app/api/agents/[id]/resume/route.ts` | 1 | Resume agent API |
| `app/src/lib/idle-detector.ts` | 1 | Auto-pause idle agents |
| `app/src/lib/token-sync.ts` | 2 | Redis → PostgreSQL sync |
| `app/src/app/api/agents/[id]/usage/route.ts` | 2 | Per-agent token usage |
| `app/src/lib/model-router.ts` | 3 | Tier → quantization routing |
| `app/src/lib/prompt-cache.ts` | 4 | Prompt hash + sharing |
| `app/src/lib/prompt-warmer.ts` | 4 | Pre-warm inference cache |
| `app/src/lib/inference-backend.ts` | 5 | Ollama ↔ vLLM switcher |
| `os/config/.../hive-inference-vllm.service` | 5 | (Optional appliance) vLLM systemd service |
| `app/src/app/api/system/inference/route.ts` | 5 | Backend status/switch API |
| `app/src/app/api/system/inference/stats/route.ts` | 6 | Observability dashboard |

### Modified Files (14)

| File | Changes |
|------|---------|
| `app/src/lib/firecracker.ts` | `pauseVM()`, `resumeVM()`, `getVMMetadata()`, return `vsockCID`, `listRunningVMs()` paused detection |
| `app/src/lib/runtime.ts` | Exports pause/resume/getVMMetadata |
| `app/src/db/schema.ts` | `inferenceTierEnum`, `inferenceUsage` table, 5 new agents fields |
| `app/src/lib/authorize.ts` | `HIVE_INTERNAL_TOKEN` check (operator, no DB lookup) |
| `app/src/lib/redis.ts` | `scanKeys()`, extended `SystemEvent` type |
| `app/src/app/api/agents/[id]/start/route.ts` | CID→agentId Redis mapping + activity timestamp |
| `app/src/app/api/agents/[id]/stop/route.ts` | CID Redis key cleanup |
| `app/src/app/api/agents/[id]/route.ts` | PATCH: `inferenceTier`, `preferredModel` |
| `app/src/app/(dashboard)/agents/[id]/page.tsx` | 3-state buttons (Pause/Resume/Stop) |
| `os/scripts/hive-vsock-proxy.py` | (Optional appliance) asyncio proxy implementation |
| `os/config/.../hive-vsock-proxy.service` | (Optional appliance) systemd unit |
| `os/config/.../hive-redis.service` | (Optional appliance) systemd unit |
| `os/config/.../hive.conf` | (Optional appliance) inference config file |
| `os/config/.../hive.env.template` | (Optional appliance) env template |
| `os/scripts/first-boot.sh` | (Optional appliance) first boot initialization |
| `os/config/package-lists/hive.list.chroot` | (Optional appliance) image packages |

---

## 14. Startup & Lifecycle

### Startup Sequence (conceptual)

```
1. Docker Compose / Kubernetes (one-time setup + boot order)
   ├─ Generate and store secrets (AUTH_SECRET, ENCRYPTION_KEY, HIVE_INTERNAL_TOKEN, Redis password)
   ├─ Start Redis (auth enabled) + PostgreSQL
   ├─ Run migrations (init job or app entrypoint)
   ├─ Start inference service (Ollama/vLLM)
   └─ Start `hive-app` behind a reverse proxy

2. hive-app startup
   ├─ startIdleDetector()     → check every 30s
   ├─ startTokenSync()        → flush every 60s
   └─ refreshAvailableModels() → cache every 5min

3. Agent lifecycle
   ├─ POST /api/agents/{id}/start
   │   ├─ startVM()
   │   ├─ Redis: CID mapping, activity timestamp
   │   └─ prewarmAgent() (if config.prewarmOnStart)
   │
   ├─ (idle 5min)
   │   └─ Idle detector → pauseVM() → status: paused
   │
   ├─ (inference request arrives at proxy)
   │   ├─ Proxy: check hive:agent:paused:{id}
   │   ├─ Proxy: POST /api/agents/{id}/resume
   │   ├─ Proxy: wait 150ms
   │   └─ Proxy: forward to Ollama/vLLM
   │
   └─ POST /api/agents/{id}/stop
       ├─ stopVM()
       └─ Redis: cleanup CID, instance, activity, paused keys
```

### Verification

| Test | How to verify |
|------|---------------|
| Pause/Resume | Start agent → pause → verify 0% CPU → resume → operational <200ms |
| Auto-sleep | Start agent → wait 5min → status auto-paused |
| Auto-resume | Paused agent → send inference → auto-resumes → response OK |
| Token tracking | 10 requests → verify Redis counters → verify DB after 60s sync |
| Tiers | 2 agents (low/high) → low rate-limited, high passes |
| Quantization | tier=low → receives Q4, tier=high → receives FP16 |
| vLLM switch | POST /api/system/inference → Ollama stops, vLLM starts |
| Prompt cache | 2 agents same prompt → prefix cache hit in vLLM metrics |
| Redis auth | `redis-cli` without -a → NOAUTH error |
| Internal token | Proxy auto-resume → 200 OK (not 401) |
