# Hive -- Long-Term Technology Vision

> Reference document: open-source technologies (Apache 2.0 / MIT) to make Hive
> the most advanced AI agent OS in the world.
>
> Compiled on 2026-03-20. Based on extensive research of the OSS ecosystem.

---

## Table of Contents

1. [Layered Architecture](#1-layered-architecture)
2. [Layer 0 -- Bare Metal & Confidential Computing](#2-layer-0--bare-metal--confidential-computing)
3. [Layer 1 -- Execution Tiers (Firecracker + WASM)](#3-layer-1--execution-tiers-firecracker--wasm)
4. [Layer 2 -- Agent Mesh & Networking](#4-layer-2--agent-mesh--networking)
5. [Layer 3 -- Shared Memory & CRDTs](#5-layer-3--shared-memory--crdts)
6. [Layer 4 -- Protocols (MCP + A2A)](#6-layer-4--protocols-mcp--a2a)
7. [Layer 5 -- Security Stack](#7-layer-5--security-stack)
8. [Layer 6 -- Observability & Causal Tracing](#8-layer-6--observability--causal-tracing)
9. [Layer 7 -- GPU Scheduling](#9-layer-7--gpu-scheduling)
10. [Layer 8 -- Swarm Intelligence](#10-layer-8--swarm-intelligence)
11. [Layer 9 -- High-Performance I/O](#11-layer-9--high-performance-io)
12. [Integration Roadmap](#12-integration-roadmap)
13. [Deployment & Developer Experience (DX)](#13-deployment--developer-experience-dx)
14. [Crypto Stack](#14-crypto-stack)

---

## 1. Layered Architecture

```
Layer 8   Swarm Intelligence      Genetic evolution, emergent consensus, stigmergy
Layer 7   GPU Scheduling          Dynamic partitioning, fractional allocation
Layer 6   Observability           eBPF kernel tracing, causal tracing, energy monitoring
Layer 5   Security                Zero-trust, capabilities, semantic watchdog
Layer 4   Protocols               MCP (agent↔tools) + A2A (agent↔agent)
Layer 3   Shared Memory           CRDTs, vector DB, collective neural memory
Layer 2   Agent Mesh              Gossip discovery, NATS messaging, intent networking
Layer 1   Execution               Firecracker microVMs + WASM lightweight tier
Layer 0   Bare Metal              Confidential computing, CXL memory pooling
```

Each layer depends on the one below it. We build from the bottom up.

---

## 2. Layer 0 -- Bare Metal & Confidential Computing

**Goal:** Agents run inside hardware-encrypted enclaves. Even the admin cannot read an agent's memory.

### Selected Tools (all Apache 2.0)

| Tool | License | Stars | Role |
|------|---------|-------|------|
| **Kata Containers** | Apache 2.0 | ~7.5k | Container runtime in microVMs with TEE support |
| **Confidential Containers (CoCo)** | Apache 2.0 | ~600+ | Complete stack for confidential workloads (CNCF Sandbox) |
| **VirTEE sev/tdx** | Apache 2.0 | ~170-240 | Rust libs for AMD SEV-SNP / Intel TDX APIs |
| **OpenPCC** | Apache 2.0 | New | Privacy protocol layer for AI inference |
| **Apache Teaclave** | Apache 2.0 | ~500+ | Rust SDK for custom SGX enclaves |
| **Occlum** | BSD | ~700+ | SGX LibOS in Rust (alternative to Gramine, permissive license) |

### Integration Architecture

```
Agent Container Image (encrypted)
        │
        ▼
CoCo Operator (attests the TEE hardware)
        │
        ▼
Kata Containers (provisions microVM in TEE)
        │           │
        ▼           ▼
  AMD SEV-SNP    Intel TDX
  (VM memory     (Trust Domain,
   encrypted)     isolated from host)
        │
        ▼
VirTEE libs (remote attestation:
  prove the correct code is running)
```

**Flow:**
1. Agent image encrypted with CoCo tooling
2. Deployment: CoCo provisions a TEE (SEV-SNP or TDX)
3. Remote attestation proves the correct code
4. Decryption keys injected only into the attested enclave
5. The agent runs with hardware-level encrypted memory

**Important note:** Firecracker does NOT support vTPM or TEEs directly.
For confidential computing, you must use Cloud Hypervisor or QEMU as the VMM backend via Kata Containers.

---

## 3. Layer 1 -- Execution Tiers (Firecracker + WASM)

**Goal:** Two execution tiers. WASM for lightweight agents (<5ms cold start). Firecracker for complex agents.

### Selected Tools

| Tool | License | Stars | Role |
|------|---------|-------|------|
| **Wasmtime** | Apache 2.0 | ~17.7k | Reference WASM runtime (Bytecode Alliance) |
| **WasmEdge** | Apache 2.0 | ~10.5k | WASM runtime with ML inference (CNCF Sandbox) |
| **Extism** | BSD-3 | ~5k | WASM plugin framework (wraps Wasmtime) |
| **Fermyon Spin** | Apache 2.0 | ~5.5k | WASM serverless framework (CNCF Sandbox) |

### Two-Tier Architecture

```
┌─────────────────────────────────────────────────┐
│                 Hive Orchestrator                │
│                                                  │
│   Evaluates the agent's needs:                  │
│   - Filesystem access? → Tier 2                 │
│   - GPU needed?        → Tier 2                 │
│   - Arbitrary code?    → Tier 2                 │
│   - Otherwise          → Tier 1                 │
└──────────┬────────────────────────┬──────────────┘
           │                        │
    ┌──────▼──────┐          ┌──────▼──────┐
    │   Tier 1    │          │   Tier 2    │
    │   WASM      │          │  Firecracker│
    │             │          │             │
    │ Cold: <5ms  │          │ Cold: ~125ms│
    │ Mem: ~8-15MB│          │ Mem: ~128MB+│
    │ Sandbox lang│          │ Full Linux  │
    │             │          │             │
    │ Wasmtime +  │          │ microVM     │
    │ Extism      │          │ complete    │
    │ plugins     │          │             │
    └─────────────┘          └─────────────┘
```

### Recommended Choices

- **Core runtime:** Wasmtime (standards compliance, Component Model, WASI-NN)
- **Plugin framework:** Extism on top of Wasmtime (15+ host SDKs, host-controlled HTTP)
- **ML in WASM:** WasmEdge if in-sandbox LLM inference is needed (llama.cpp WASI-NN)
- **Escalation:** Agent starts in WASM, escalates to Firecracker if it needs capabilities beyond WASI

### Capabilities per Tier

| Capability | WASM (Tier 1) | Firecracker (Tier 2) |
|-----------|---------------|---------------------|
| JSON/text processing | Yes | Yes |
| HTTP requests | Host-controlled via Extism | Full |
| File system | No (except limited WASI) | Full Linux FS |
| GPU inference | WasmEdge WASI-NN only | Full CUDA |
| Arbitrary code execution | No | Yes |
| Package installation | No | Yes |
| Persistent state | Via host KV store | Full disk |
| Cold start | <5ms | ~125ms |

---

## 4. Layer 2 -- Agent Mesh & Networking

**Goal:** Agents discover, communicate, and organize themselves into a mesh without a central broker.

> **Current implementation (mesh v1)**: local Redis bus + A2A on a single Hive instance — see [`MESH_V1_DONE.md`](./MESH_V1_DONE.md) (status **closed** for this scope). **Global goal (mesh V2)**: federation, WAN, directory — roadmap in [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md).

### Selected Tools

| Tool | License | Stars | Role |
|------|---------|-------|------|
| **NATS / JetStream** | Apache 2.0 | ~17k | High-performance messaging, pub/sub, streaming |
| **memberlist** (HashiCorp) | MPL 2.0 | ~3.5k | SWIM gossip protocol for discovery |
| **libp2p** | MIT + Apache 2.0 | ~6k+ | P2P mesh for WAN/multi-site (future) |
| **mDNS libs** | MIT/Apache 2.0 | - | Local same-host discovery |

### 3-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Messaging (NATS)                      │
│  - Subject-based addressing                     │
│  - Request-Reply for inter-agent RPC            │
│  - Queue Groups for load balancing              │
│  - JetStream for persistence and audit          │
│  - Embeddable in the Hive binary                │
├─────────────────────────────────────────────────┤
│  Layer 2: Discovery (memberlist)                │
│  - Gossip SWIM protocol                         │
│  - Each Hive node runs a memberlist agent       │
│  - Node metadata: agent IDs, capabilities, GPU  │
│  - Automatic failure detection                  │
│  - Works on LAN and WAN                         │
├─────────────────────────────────────────────────┤
│  Layer 1: Local Discovery (mDNS)                │
│  - Agents on the same host                      │
│  - Zero-config via bridge network               │
│  - Complement for intra-node                    │
└─────────────────────────────────────────────────┘
```

### Why NATS and Not ZeroMQ/Kafka/Redis pub/sub

- **NATS** is a single Go binary (~15MB), embeddable, full-mesh auto-clustering
- Subject-based addressing eliminates the need for a registry: `hive.agents.{id}.inbox`
- JetStream provides the persistence that Redis pub/sub lacks (at-least-once, exactly-once)
- Leaf nodes for edge/disconnected scenarios
- Apache 2.0, no license trap

### Addressing Scheme

```
hive.agents.{agent_id}.inbox       Direct message to an agent
hive.agents.{agent_id}.status      Status updates from an agent
hive.tasks.{capability}            Task routing by capability
hive.broadcast                     Message to all agents
hive.groups.{group_id}.events      Events for an agent group
```

### Future: libp2p for Multi-Site

If Hive evolves toward multi-site with NAT traversal, libp2p replaces memberlist+NATS:
- Kademlia DHT for WAN discovery
- GossipSub for pub/sub on mesh overlay
- Automatic NAT hole-punching
- Dual MIT/Apache 2.0

---

## 5. Layer 3 -- Shared Memory & CRDTs

**Goal:** Agents share mutable state without central coordination. Collective neural memory.

### Selected Tools

| Tool | License | Stars | Role |
|------|---------|-------|------|
| **pgvector + pgvectorscale** | PostgreSQL OSS | ~13k | Vector DB in PostgreSQL (already in place) |
| **LanceDB** | Apache 2.0 | ~5k | Embedded vector DB per-agent (TypeScript SDK) |
| **Loro** | MIT | ~4k | Rust CRDT with MovableTree, counters, time-travel |
| **Automerge** | MIT | ~5k | Rust/Go/JS CRDT with full history DAG |
| **Electric SQL** | Apache 2.0 | ~7k | Postgres sync engine for multi-agent |
| **rust-crdt** | Apache 2.0 | ~1.5k | Low-level CRDT primitives in Rust |

### 2-Tier Memory Architecture

```
Agent Firecracker microVM
  ┌──────────────────────────────┐
  │  Agent Process (Node.js)     │
  │                              │
  │  ┌─ LanceDB (local) ────┐   │ ← Local episodic memory
  │  │  Fast, in-process     │   │   Queries ~1ms
  │  │  Agent's own context  │   │
  │  └───────────────────────┘   │
  │           │ periodic sync    │
  └───────────┼──────────────────┘
              ▼
  ┌──────────────────────────────┐
  │  PostgreSQL 16               │
  │                              │
  │  ┌─ pgvector ────────────┐   │ ← Shared collective memory
  │  │  + pgvectorscale      │   │   Cross-agent semantic search
  │  │  (StreamingDiskANN)   │   │   ACID, RLS per-agent
  │  └───────────────────────┘   │
  │                              │
  │  ┌─ Loro/Automerge CRDT──┐   │ ← Conflict-free shared state
  │  │  Serialized in JSONB  │   │   Task queues, shared config
  │  │  Synced via NATS      │   │   Auto merge without locks
  │  └───────────────────────┘   │
  └──────────────────────────────┘
```

### PostgreSQL Schema for Agent Memory

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vectorscale;

CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  memory_type TEXT NOT NULL,  -- 'episodic', 'semantic', 'procedural'
  importance FLOAT DEFAULT 0.5,
  access_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON agent_memories USING diskann (embedding vector_cosine_ops);

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_memory_isolation ON agent_memories
  USING (agent_id = current_setting('app.current_agent_id')::uuid);
```

### Why pgvector and Not Qdrant/Milvus

- Hive ALREADY runs PostgreSQL 16. Zero additional infrastructure.
- Native RLS for per-agent isolation (battle-tested, not a startup's v1)
- Drizzle ORM already in place
- pgvectorscale StreamingDiskANN: 28x lower p95 latency vs Pinecone
- Existing PG backup, replication, monitoring
- For future scale-up: Qdrant in a dedicated Tier 2

### CRDTs for Shared Inter-Agent State

**Loro** (MIT, Rust core) is the primary choice:
- MovableTree: agent task hierarchies
- Counter: distributed metrics
- Map: shared config
- Time-travel: debug and audit of decisions
- Python bindings for ML/AI frameworks
- Serialized in binary, synced via NATS JetStream

---

## 6. Layer 4 -- Protocols (MCP + A2A)

**Goal:** Every agent is an MCP server and an A2A participant. Universal interoperability.

### MCP (Model Context Protocol)

| Component | License | Role |
|-----------|---------|------|
| MCP Spec | MIT | The agent↔tools protocol |
| TypeScript SDK | Apache 2.0/MIT | For the Next.js control plane |
| Python SDK | MIT | For agents in microVMs |
| Rust SDK | Apache 2.0/MIT | For native components |
| Reference Servers | MIT | Filesystem, Git, PostgreSQL, etc. |

**MCP has been governed by AAIF (Linux Foundation) since December 2025.**
Co-founded by Anthropic, Block, OpenAI. Members: AWS, Google, Microsoft, Cloudflare.
16,000+ MCP servers exist. It is the de facto standard.

### A2A (Agent-to-Agent Protocol)

| Component | License | Role |
|-----------|---------|------|
| A2A Spec v0.3 | Apache 2.0 | The agent↔agent protocol |
| A2A SDKs | Apache 2.0 | Go, Python, TypeScript, Java |

**A2A has been under the Linux Foundation since June 2025.**
150+ organizations. IBM's ACP merged with A2A in September 2025.
It is THE universal agent↔agent standard. No need to invent a new one.

### The Key Distinction

```
MCP  = How an agent talks to TOOLS (DB, APIs, files)
A2A  = How an agent talks to OTHER AGENTS (delegation, collaboration)

Agent A ──MCP──► PostgreSQL (query data)
Agent A ──A2A──► Agent B (delegate analysis task)
Agent B ──MCP──► Python REPL (execute code)
Agent B ──A2A──► Agent A (return results)
```

### MCP+A2A Architecture in Hive

```
┌───────────────────────────────────────────┐
│            Hive Control Plane             │
│         (Next.js + MCP Gateway)           │
│                                           │
│  ┌─ MCP Client Hub ──────────────────┐   │
│  │  Connects to all agent MCP servers│   │
│  │  Routes tool calls                │   │
│  │  Auth via OAuth 2.1               │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌─ A2A Router ──────────────────────┐   │
│  │  Routes inter-agent tasks         │   │
│  │  Agent Cards registry             │   │
│  │  SSE streaming for task updates   │   │
│  └───────────────────────────────────┘   │
└─────────┬───────────────┬─────────────────┘
          │               │
   MCP (Streamable HTTP)  A2A (HTTP + gRPC)
          │               │
  ┌───────▼───┐    ┌──────▼────┐    ┌──────────────┐
  │ Agent A   │    │ Agent B   │    │ External     │
  │ MCP Server│    │ MCP Server│    │ MCP Servers   │
  │ A2A Card  │    │ A2A Card  │    │ (GitHub,     │
  │ (microVM) │    │ (microVM) │    │  Postgres,   │
  └───────────┘    └───────────┘    │  Slack...)   │
                                    └──────────────┘
```

### MCP Gateways (for Security and Routing)

| Gateway | License | Focus |
|---------|---------|-------|
| **agentgateway** (Solo.io/LF) | Apache 2.0 | Rust, high perf, MCP+A2A |
| **Microsoft MCP Gateway** | MIT | K8s, session-aware |
| **IBM ContextForge** | Apache 2.0 | Federation MCP+A2A+REST |
| **Lasso MCP Gateway** | Apache 2.0 | Security-first, DLP |

### DB Schema for MCP

```sql
CREATE TABLE mcp_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  transport TEXT DEFAULT 'streamable-http',
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  transport TEXT DEFAULT 'streamable-http',
  auth_config JSONB,
  status TEXT DEFAULT 'disconnected',
  tools_cache JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Open A2A vs Hive Trusted Mesh

Hive implements A2A at **two levels**. The protocol is always standard A2A — we do not fork the spec, we overlay a trust layer.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Hive Trusted Mesh (opt-in)                      │
│                                                                     │
│  Between Hive instances / trusted peers:                           │
│  - JWT Ed25519 per-peer (keys in env or signed manifest)           │
│  - Signed manifest roster (Ed25519, CDN-hosted, versioned)         │
│  - Anti-replay Redis jti                                            │
│  - Auto-discovery via /.well-known/hive-mesh.json                  │
│  - IP allowlist inbound, rate limiting per-peer                    │
│  - Active probe of federated Agent Cards                           │
│                                                                     │
│  → For: multi-instance federation, private mesh, operators         │
├─────────────────────────────────────────────────────────────────────┤
│                     A2A Open Protocol (standard)                    │
│                                                                     │
│  Any A2A-compliant agent in the world:                             │
│  - Standard Agent Card (/.well-known/agent-card.json)              │
│  - Auth via OAuth 2.0 / Bearer token (securitySchemes)             │
│  - JSON-RPC transport (tasks/send, tasks/get, tasks/cancel)        │
│  - SSE streaming (tasks/sendSubscribe)                             │
│  - Push notifications (tasks/pushNotification/set) — optional      │
│                                                                     │
│  → For: interop with LangGraph, CrewAI, AutoGen, any A2A agent    │
└─────────────────────────────────────────────────────────────────────┘
```

**Principle:** A LangGraph or CrewAI agent can call a Hive agent via standard A2A (OAuth 2.0 Bearer). Two Hive instances between themselves additionally use the trusted mesh layer (JWT Ed25519 + manifest). Both coexist on the same endpoints.

**What remains to be built for open A2A:**

| Gap | Status | Priority |
|-----|--------|----------|
| OAuth 2.0 `securitySchemes` in the Agent Card | Missing | P0 Phase 2 |
| `tasks/sendSubscribe` (SSE streaming) | To verify | P0 Phase 2 |
| `tasks/pushNotification/set` (webhook push) | Missing | P1 Phase 2 |
| Accept third-party Agent Cards without Hive manifest | Missing | P1 Phase 2 |
| Interop test with official A2A SDK (Go, Python) | Missing | P1 Phase 2 |
| `tasks/cancel` full lifecycle | To verify | P1 Phase 2 |

**Dual-mode auth implementation:**

```
Inbound request
      │
      ├─ Header X-Hive-Federation-JWT ?
      │     → Hive Trusted Mesh path (Ed25519 verify, jti anti-replay)
      │
      ├─ Header Authorization: Bearer <token> ?
      │     → A2A Open path (OAuth 2.0 introspection / JWKS validation)
      │
      └─ Header X-Hive-Federation-Secret ? (legacy)
            → Legacy shared secret (deprecated, disable via env)
```

### Strategy: Fork the A2A SDKs, Build `@hive/a2a-sdk`

> A2A under the Linux Foundation already has critical mass (150+ orgs).
> The SDKs are Apache 2.0 → we can do everything: fork, modify, distribute commercially.
> **We do not fork the protocol (we stay compatible), we fork the implementation (we make it 2x better).**

#### The Fork: `@hive/a2a-sdk`

Fork the official A2A SDKs (TypeScript, Python, Go) and natively add:

```
Official A2A SDK (Apache 2.0)        @hive/a2a-sdk (forked + enhanced)
─────────────────────────            ─────────────────────────────────
HTTP transport                       HTTP transport (compatible)
JSON-RPC tasks                       JSON-RPC tasks (compatible)
Agent Cards                          Agent Cards + Signed Cards (Ed25519)
SSE streaming                        SSE streaming (compatible)
No crypto                            Native Noise Protocol E2E (snow/libp2p-noise)
No workload identity                 Native SPIFFE/SPIRE (auto mTLS)
No anti-injection                    Integrated LlamaFirewall + Schema Enforcement
No rate limiting                     Built-in rate limiting + circuit breakers
No audit                             Automatic hash-chain audit trail
No capabilities                      Integrated Tenuo capability tokens
```

#### Competitive Advantages of the Fork

1. **100% compatible with A2A standard** -- any A2A agent in the world can talk to a Hive agent
2. **Security by default** -- security features are not optional, they are activated on import
3. **Zero config** -- a single `import { HiveA2AServer } from '@hive/a2a-sdk'` gives E2E encryption + identity + injection protection without a single line of config
4. **Drop-in replacement** -- migration from official SDKs by changing 1 import

#### SDK Architecture

```typescript
// @hive/a2a-sdk -- API surface
import { HiveA2AServer, HiveA2AClient } from '@hive/a2a-sdk';

const server = new HiveA2AServer({
  agentCard: { name: 'researcher', capabilities: [...] },
  // Everything else is automatic:
  // - Noise E2E encryption via snow/libp2p-noise
  // - SPIFFE identity via workload API
  // - Schema enforcement on all messages
  // - LlamaFirewall scanning if enableGuardrails: true
  // - Hash-chain audit trail in PostgreSQL
  // - Capability token validation
});

// Compatible with ANY standard A2A client
// But if the other side is also @hive/a2a-sdk → Noise E2E activated
// Otherwise → graceful fallback to standard HTTP
```

#### Internal SDK Modules

```
@hive/a2a-sdk
├── core/              # Fork of the official A2A SDK (upstream sync)
├── crypto/
│   ├── noise.ts       # Noise Protocol IK pattern (wraps snow/libp2p-noise)
│   ├── identity.ts    # SPIFFE workload API integration
│   └── signing.ts     # Ed25519 Agent Card signing
├── security/
│   ├── schema.ts      # JSON Schema enforcement for inter-messages
│   ├── guard.ts       # LlamaFirewall + LLM Guard integration
│   ├── ratelimit.ts   # Token bucket per-agent
│   └── circuit.ts     # Circuit breaker pattern
├── audit/
│   ├── hashchain.ts   # Append-only hash chain logging
│   └── rekor.ts       # Sigstore Rekor anchoring
├── capabilities/
│   └── tenuo.ts       # Capability token mint/verify
└── compat/
    └── fallback.ts    # Graceful degradation to standard A2A
```

#### Open-Core Model for the SDK

```
OPEN SOURCE (Apache 2.0)                    PROPRIETARY (Hive Pro/Enterprise)
──────────────────────────                   ──────────────────────────────────
A2A core protocol (compatible)               Stigmergic coordination layer
Noise E2E encryption                         Swarm consensus voting
SPIFFE identity integration                  Semantic Watchdog integration
Schema enforcement                           Evolutionary agent optimization
Basic rate limiting                          Advanced anomaly detection
Ed25519 Agent Card signing                   Multi-site mesh (libp2p)
Hash-chain audit trail                       GPU-aware task routing
Circuit breakers                             Confidential Computing integration
LlamaFirewall integration hooks              Enterprise audit (Rekor anchoring)
```

**The open-source SDK is already better than anything that exists.**
**The Pro/Enterprise features are advanced orchestration and scale.**

#### Maintenance: Sync with Upstream

```
Upstream A2A SDK (Linux Foundation)
        │
        │  git remote add upstream
        │  Regular merge of new features
        │
        ▼
@hive/a2a-sdk (fork)
        │
        ├── Hive patches applied on top
        ├── CI: compatibility tests with A2A spec
        └── CI: interop tests with official SDK
```

When A2A evolves (v0.4, v0.5...), we merge upstream and verify that our extensions remain compatible. The Hive SDK is always up to date with the standard.

---

## 7. Layer 5 -- Security Stack

**Goal:** Zero-trust between all agents. Security at the architecture level, not as a feature.

### 5 Security Layers

```
Layer 5   Semantic Watchdog         AI agent that observes behaviors
          ────────────────          Semantic drift detection
                                    Automatic circuit breaker

Layer 4   Message Sanitization      Anti prompt injection between agents
          ─────────────────────     Format validation, rate limiting
                                    Schema enforcement

Layer 3   Zero Trust Networking     mTLS between all agents
          ──────────────────────    SPIFFE/SPIRE identities (Apache 2.0)
                                    Capability-based auth (Tenuo)

Layer 2   Firecracker Isolation     Each agent in its own microVM
          ─────────────────────     Breach containment by default
                                    No host access

Layer 1   eBPF Kernel Monitoring    Tetragon: syscall tracing + kill
          ─────────────────────     Cilium: network policy L3-L7
                                    Falco: security alerting
                                    Microsecond response
```

### Selected Tools (all Apache 2.0 unless noted)

| Tool | License | Role |
|------|---------|------|
| **SPIFFE/SPIRE** | Apache 2.0 | Workload identity + attestation |
| **step-ca** | Apache 2.0 | Private CA for agent certificates |
| **OPA** (Open Policy Agent) | Apache 2.0 | Inter-agent policy engine (CNCF Graduated) |
| **Casbin** | Apache 2.0 | Embedded RBAC in the dashboard |
| **SpiceDB** | Apache 2.0 | Zanzibar authorization (relationship graph) |
| **OpenFGA** | Apache 2.0 | SpiceDB alternative (CNCF Sandbox) |
| **Tenuo** | MIT/Apache 2.0 | Capability tokens for AI agents |
| **Sigstore/Cosign** | Apache 2.0 | Agent image verification |
| **Tetragon** | Apache 2.0 | eBPF runtime enforcement + kill |
| **Cilium** | Apache 2.0 | eBPF network policy (CNCF Graduated) |
| **Falco** | Apache 2.0 | eBPF security alerting (CNCF Graduated) |

### Identity Architecture

```
Agent starts in Firecracker microVM
        │
        ▼
SPIRE Agent (workload attestation)
        │
        ▼
SPIRE Server issues an SVID
(short-lived X.509 certificate, ~1h TTL)
        │
        ▼
Agent uses the SVID for mTLS
with all other agents
        │
        ▼
Automatic rotation before expiration
Instant revocation if compromised
```

### Capability-Based Security with Tenuo

```
Orchestrator creates a warrant for Agent A:
  {
    tools: ["web_scrape", "summarize"],
    paths: ["/data/project-x/*"],
    ttl: "30m",
    delegation: true  // can delegate a subset
  }

Agent A delegates to Agent B (subtractive):
  {
    tools: ["summarize"],         // subset only
    paths: ["/data/project-x/docs/*"],  // more restricted
    ttl: "10m"                    // shorter
  }

Verification: ~27 microseconds, offline, cryptographic
```

### OPA Policy for Agents

```rego
# Only agents in the "research" group can invoke the web-scraper
allow {
    input.source_agent.group == "research"
    input.target_agent.name == "web-scraper"
    input.action == "invoke"
}

# Rate limit: deny if > 100 calls/minute
deny {
    data.agent_call_counts[input.agent.id] > 100
}
```

### eBPF: Detection and Kill in Microseconds

**Tetragon** (Apache 2.0) -- The most relevant for Hive:
- Traces every syscall of every agent process
- Declarative policies (TracingPolicy YAML)
- **In-kernel enforcement**: kills the process BEFORE the syscall completes
- Example: agent attempts to open `/etc/shadow` → killed in kernel before access

**Falco** (Apache 2.0) -- Complementary alerting:
- YAML rules to detect: shell spawn, unauthorized connections, privilege escalation
- Outputs to Slack, Kafka, gRPC, etc.
- Zero custom eBPF code -- just YAML rules

### Semantic Watchdog (Hive Innovation)

A dedicated AI agent for semantic supervision:
- Observes agent DECISIONS, not just messages
- Detects behavioral drifts (output quality degradation)
- Circuit breaker: isolates a suspect agent before damage
- It is AI to secure AI -- the problem nobody has solved

### Supply Chain: Sigstore/Cosign

```bash
# Before deploying an agent, verify the image signature
cosign verify \
  --certificate-identity=builder@hive.example \
  --certificate-oidc-issuer=https://accounts.hive.example \
  registry.example.com/agent-image:latest
```

Reject any unsigned image. Combine with OPA for enforcement.

### Deep Dive: Agent Mesh Security

#### Attack Vectors Specific to the Mesh

| Attack | Severity | Description |
|--------|----------|-------------|
| **Inter-Agent Prompt Injection** | Critical | Agent A sends a message containing hidden instructions to Agent B. Viral propagation through the mesh. |
| **Agent Impersonation** | Critical | Fake agent pretends to be a trusted agent. |
| **Sybil Attack** | High | Thousands of fake agents to influence collective decisions. |
| **Memory Poisoning** | High | Malicious instructions injected into persistent memory, executed weeks later. |
| **Inference Attack** | High | Observe communication patterns to infer confidential info without reading content. |
| **Semantic Drift** | High | Behavior changes subtly without explicit errors (corrupted context). |
| **Agent Card Spoofing** | High | Fake A2A Agent Card (no signing enforced by default). |

#### Anti-Prompt Injection (Defense-in-Depth)

**Key 2026 research finding:** No single defense is sufficient. Adaptive attackers bypass most individual defenses (NAACL 2025 paper by OpenAI/Anthropic/DeepMind: >90% success rate against 12 published defenses).

**4 defense layers:**

```
Layer 1: Schema Enforcement (structural, zero-cost)
  │  Strict JSON Schema on ALL inter-agent messages
  │  Per-request nonce to detect replays
  │  Separate fields: instruction vs data (never mixed)
  │  → Eliminates propagation injection at 100% (Sibylline 2026 paper)
  │
Layer 2: LLM Guard (fast scanning, MIT license)
  │  15 input scanners + 20 output scanners
  │  Prompt injection detection, PII anonymization
  │  Sub-50ms per message
  │  github.com/protectai/llm-guard
  │
Layer 3: LlamaFirewall (Meta, Apache 2.0)
  │  PromptGuard 2: SOTA jailbreak detector
  │  Agent Alignment Checks: reasoning trace auditing
  │  >90% effectiveness on AgentDojo benchmark
  │  github.com/meta-llama/PurpleLlama
  │
Layer 4: NeMo Guardrails (NVIDIA, Apache 2.0)
     Colang 2.0: language for defining conversational rails
     Multi-turn dialog flow control
     github.com/NVIDIA-NeMo/Guardrails
```

#### Anti-Sybil

```
1. TPM-bound SPIRE attestation
   → Hard limit: 1 TPM = 1 machine = N agents max
   → bloomberg/spire-tpm-plugin (Apache 2.0)

2. Rate limiting at the SPIRE Server level
   → Max N SVIDs per node per hour

3. Proof-of-Work for registration
   → SHA-256 puzzle ~30s per agent
   → Affordable for legitimate agents
   → Prohibitive for creating thousands

4. Progressive reputation
   → New agents = restricted capabilities
   → Trust score increases with verified successes
   → Reputations stored in PostgreSQL
```

#### Anti-Impersonation (Beyond mTLS)

| Layer | Tool | License | What it proves |
|-------|------|---------|----------------|
| Hardware | SPIRE + TPM plugin | Apache 2.0 | "I am running on real hardware" |
| Runtime | Keylime | Apache 2.0 (CNCF Sandbox) | "I am still running the correct code" |
| Supply chain | Sigstore cosign | Apache 2.0 | "My image is the one that was intended" |
| Hardware enclave | AMD SEV-SNP (VirTEE) | Apache 2.0 | "Even the hypervisor cannot modify me" |

**Keylime** (github.com/keylime/keylime) -- continuous runtime attestation:
- Continuously measures the kernel, initrd, and agent binary
- If a measurement drifts from the baseline → SVID revoked → NATS rejects the agent
- Apache 2.0, CNCF Sandbox

#### Anti-Inference (Communication Pattern Protection)

```
1. Fixed-size message padding
   → All NATS messages padded to 4096 bytes
   → Prevents correlation by size

2. Constant-rate cover traffic
   → Each agent sends 1 msg/T ms (even when idle)
   → Real messages replace the chaff
   → Prevents frequency/timing analysis

3. Nym Mixnet (Apache 2.0) for cross-network
   → Sphinx packets: all identical (2048 bytes)
   → Continuous cover traffic
   → github.com/nymtech/nym
   → Trade-off: additional latency
```

#### Semantic Drift Detection

**SentinelAgent pattern** (paper arXiv:2505.24201):
- Models interactions as a dynamic execution graph
- Anomaly detection at 3 levels: node, edge, path
- Combines rules + LLM-based semantic reasoning

**Implementation for Hive:**

```
1. Periodic belief probes
   → Standardized query sent to each agent
   → "What is your understanding of policy X?"
   → Compare response embedding vs baseline
   → Alert if distance > threshold

2. Memory provenance tracking
   → Each memory entry: source, trust score, timestamp
   → Trust levels: system > user > external > inferred
   → A-MemGuard: reduces poisoning success rate by 95%

3. Multi-agent verification
   → Critical decisions: N-of-M agreement required
   → If Agent A diverges from B and C → flag for investigation
   → Via NATS request-reply multi-responders

4. Behavioral baselines
   → Distribution of decisions, confidence scores
   → Anomaly detection: isolation forests
   → Prometheus metrics + alerting
```

#### E2E Encryption: Noise Protocol

**Why Noise and not just TLS:**

| | Noise Protocol | TLS 1.3 |
|--|---------------|---------|
| Handshake | 1 round-trip (0-RTT possible) | 2 round-trips |
| Forward secrecy | Keys destroyed after each message | Session-level only |
| Identity protection | Encrypted handshake | Cleartext handshake |
| PKI required | No (static keys suffice) | Yes (X.509 CAs) |
| Code | ~5,000 lines | ~50,000+ lines |
| Ciphersuites | Fixed at compile time (no downgrade) | Negotiated (attack surface) |

**Selected libraries:**

| Lib | Language | License | Usage |
|-----|----------|---------|-------|
| **snow** | Rust | Apache 2.0 / MIT | Agent runtime in Firecracker |
| **@chainsafe/libp2p-noise** | TypeScript | Apache 2.0 / MIT | Next.js control plane |
| **clatter** | Rust | MIT | Future post-quantum (Kyber) |
| **snowstorm** | Rust | MIT | Async stream wrapper on snow |

**Dual-layer architecture:**

```
NATS transport    →  TLS 1.3 + mTLS (SPIFFE SVIDs)
                     The NATS server sees the metadata (who→who)
                     but not the content

Agent E2E         →  Noise Protocol (IK pattern via snow)
                     Payload encrypted end-to-end
                     NATS server sees only ciphertext
                     Forward secrecy per-message
                     Even Hive cannot read the messages
```

#### Immutable Audit Trail (Without Blockchain)

**Hash chain in PostgreSQL (zero new infra):**

```sql
CREATE TABLE agent_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    task_id         UUID NOT NULL,
    action          TEXT NOT NULL,
    payload         JSONB NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    prev_hash       BYTEA NOT NULL,
    entry_hash      BYTEA NOT NULL GENERATED ALWAYS AS (
        sha256(prev_hash || agent_id::bytea || task_id::text::bytea ||
               action::bytea || payload::text::bytea || timestamp::text::bytea)
    ) STORED,
    actor_signature BYTEA  -- signed with SPIFFE SVID
);

-- APPEND-ONLY: revoke UPDATE and DELETE
REVOKE UPDATE, DELETE ON agent_audit_log FROM app_role;
```

**External anchoring via Sigstore Rekor (Apache 2.0):**

```
PostgreSQL hash chain     →    Sigstore Rekor
(primary store)                (external witness)

Agent Decision ─────────► Hash-chained row ─── every N entries ──► Merkle root
                          (append-only,          published to Rekor
                           full payload)         (tamper-evident,
                                                  third-party verifiable)
```

**Google Trillian** (Apache 2.0) as an alternative if a dedicated Merkle tree is needed.

#### OWASP Top 10 for Agentic Applications (Dec 2025)

The official reference for agent security. Hive must cover all 10:

| # | Risk | Hive Coverage |
|---|------|---------------|
| ASI01 | Agent Goal Hijack | LlamaFirewall + Schema Enforcement |
| ASI02 | Tool Misuse | Tenuo capabilities + OPA policies |
| ASI03 | Identity & Privilege Abuse | SPIFFE/SPIRE + SpiceDB |
| ASI04 | Insecure Supply Chain | Sigstore/Cosign + image verification |
| ASI05 | Unexpected Code Execution | Firecracker isolation + Tetragon |
| ASI06 | Memory & Context Poisoning | A-MemGuard + provenance tracking |
| ASI07 | Insecure Inter-Agent Comms | Noise E2E + A2A Signed Cards |
| ASI08 | Cascading Failures | Circuit breakers + Semantic Watchdog |
| ASI09 | Human-Agent Trust Exploitation | NeMo Guardrails + approval gates |
| ASI10 | Rogue Agents | Behavioral baselines + N-of-M consensus |

**OWASP principle introduced:** **Least-Agency** -- extension of Least Privilege.
An agent receives only the minimum autonomy required for its defined task.

---

## 8. Layer 6 -- Observability & Causal Tracing

**Goal:** Trace causal chains across the entire swarm. "Agent A did X → which caused Y at Agent B → which triggered Z."

### Selected Tools (all Apache 2.0 / MIT)

| Tool | License | Role |
|------|---------|------|
| **OpenTelemetry** | Apache 2.0 | Standard instrumentation (CNCF) |
| **ClickHouse** | Apache 2.0 | Analytical storage for traces |
| **Jaeger** | Apache 2.0 | Tracing backend + UI |
| **Quickwit** | Apache 2.0 | Search engine for logs/traces |
| **Prometheus** | Apache 2.0 | Time-series metrics |
| **HyperDX** | MIT | Visualization (ClickStack) |
| **Kepler** | Apache 2.0 | Per-agent energy monitoring (eBPF) |
| **CausalNex** | Apache 2.0 | Bayesian causal inference |
| **DoWhy** | MIT | Counterfactual analysis |

### Recommended Stack

```
Instrumentation    OpenTelemetry SDKs (GenAI Agent Semantic Conventions)
        │
Collection         OpenTelemetry Collector
        │
        ├──────────────────┐
        ▼                  ▼
Storage             Storage (search)
 ClickHouse          Quickwit
(SQL analytics)     (full-text search)
        │                  │
        ▼                  ▼
Visualization       Causal Analysis
HyperDX / Jaeger    CausalNex / DoWhy
```

**Hive (Node runtime):** when `OTEL_EXPORTER_OTLP_ENDPOINT` is defined, the Next server exports OTLP/HTTP traces and metrics (mesh A2A, Redis rate limit saturation). See [MESH_OBSERVABILITY.md](./MESH_OBSERVABILITY.md). The dedicated WAN gateway and inter-instance mTLS are documented separately ([MESH_GATEWAY_WAN.md](./MESH_GATEWAY_WAN.md), [MESH_MTLS.md](./MESH_MTLS.md)) — operator infrastructure, outside the application binary.

### OpenTelemetry GenAI Agent Conventions

OTel now defines span types specific to AI agents:
- `create_agent {gen_ai.agent.name}` -- agent creation
- `invoke_agent {gen_ai.agent.name}` -- invocation
- `execute_tool {gen_ai.tool.name}` -- tool execution
- **Span Links** for async inter-agent causality

### Causal Tracing SQL (ClickHouse)

```sql
-- Reconstruct the causal chain of a trace
SELECT agent_name, operation, start_time, parent_span_id
FROM traces
WHERE trace_id = 'abc123'
ORDER BY start_time;

-- Detect correlations: "Agent B fails when Agent A skips validation"
SELECT
  a.agent_name as trigger_agent,
  b.agent_name as affected_agent,
  count(*) as failure_count
FROM traces a
JOIN traces b ON a.trace_id = b.trace_id
WHERE b.status = 'ERROR'
  AND a.end_time < b.start_time
GROUP BY 1, 2
ORDER BY failure_count DESC;
```

### AVOID (AGPL License)

- Grafana, Loki, Tempo, Mimir -- all AGPLv3 since 2021
- Uptrace -- AGPLv3
- If dashboards are needed: HyperDX (MIT) or Jaeger UI (Apache 2.0)

---

## 9. Layer 7 -- GPU Scheduling

**Goal:** Dynamic GPU partitioning between agents. An idle agent automatically releases its fractions.

### Selected Tools (all Apache 2.0)

| Tool | License | Role |
|------|---------|------|
| **KAI Scheduler** (ex-Run:ai) | Apache 2.0 | Fractional GPU scheduler (open-sourced by NVIDIA) |
| **HAMi** | Apache 2.0 | GPU virtualization with hard memory isolation (CNCF Sandbox) |
| **mig-parted** | Apache 2.0 | Declarative MIG partitioning (bare metal) |
| **go-nvml** | Apache 2.0 | Go NVIDIA bindings for programmatic MIG |
| **DCGM + dcgm-exporter** | Apache 2.0 | GPU monitoring (Prometheus metrics) |
| **GPUStack** | Apache 2.0 | Standalone GPU cluster manager (no K8s) |
| **Volcano** | Apache 2.0 | Batch scheduler (CNCF Incubating) |

### GPU Architecture for Hive

**Phase 1 -- Bare metal (no K8s):**
```
mig-parted (declarative YAML)
    │
    ▼
NVIDIA MIG (hardware partitioning)
    │
    ├── 1g.10gb → Lightweight agent inference
    ├── 2g.20gb → Medium agent inference
    └── 4g.40gb → Agent fine-tuning

go-nvml → Programmatic repartitioning
DCGM    → Monitoring and metrics
GPUStack → If LLM inference focused
```

**Phase 2 -- With K8s:**
```
KAI Scheduler (hierarchical fair-share)
    │
    ├── Queue "inference" (guaranteed 4 GPUs, burst to 8)
    ├── Queue "training" (guaranteed 2 GPUs)
    └── Queue "batch" (best-effort, preemptable)

HAMi → Hard memory isolation per-agent
       CUDA interception, enforced quotas
```

### Fractional GPU: Methods Compared

| Method | Memory Isolation | Requires K8s | Hardware Required |
|--------|------------------|-------------|-------------------|
| MIG (mig-parted) | Full (hardware) | No | A100/H100/L40 |
| HAMi | Hard (enforced) | Yes | Any NVIDIA |
| Time-slicing | None | Yes | Any NVIDIA |
| CUDA MPS | Partial | No | Any NVIDIA |

---

## 10. Layer 8 -- Swarm Intelligence

**Goal:** Agents self-organize, evolve, and reach consensus in an emergent manner.

### Patterns Identified (from CrewAI, AutoGen, LangGraph, MetaGPT, OpenAI Swarm)

#### Pattern 1: Handoff (from OpenAI Swarm)
The simplest. An agent completes its work and "hands off" the entire context to another agent.
```
Agent A (planner) ──handoff──► Agent B (executor) ──handoff──► Agent C (reviewer)
```
Implementation: NATS message with complete context on `hive.agents.{target}.inbox`

#### Pattern 2: Graph Workflow (from LangGraph)
Nodes = agents. Edges = conditional data flow. Cycles allowed (reviewer sends back to producer).
```
Planner ──► Researcher ──► Writer ──► Reviewer
                                         │
                                    fail │ pass
                                         │
                                    Writer ◄─┘     ──► Output
```
Implementation: workflow graph in PostgreSQL, evaluated by the Hive orchestrator.

#### Pattern 3: SOP-Driven (from MetaGPT)
Each agent produces structured artifacts that the next one consumes.
```
Product Manager → PRD document
Architect → Design document (consumes PRD)
Engineer → Code (consumes Design)
Reviewer → Review (consumes Code) → feedback loop
```
Implementation: artifacts stored in PostgreSQL/S3, schema validated at each step.

#### Pattern 4: Stigmergy (Innovation)
Agents leave "pheromones" in a shared environment. No direct messages.
```
Redis sorted sets as pheromone layer:
  Key: task_type (e.g., "data_analysis")
  Score: signal intensity (decays over time)

Idle agent → poll its keys → act on the strongest signal
Success → reinforces the signal of the path taken
Failure → signal decays
```
Implementation: Redis sorted sets + background decay process.

#### Pattern 5: Consensus Voting (from Raft/PBFT)
N agents vote on a result. Quorum required before action.
```
3 agents analyze the same problem
2/3 must converge → decision accepted
If 3/3 diverge → escalation to a senior agent
```
Implementation: etcd/raft (Apache 2.0) for consensus, or simple quorum via NATS request-reply.

### Evolutionary Optimization

| Tool | License | Role |
|------|---------|------|
| **pymoo** | Apache 2.0 | Multi-objective optimization (NSGA-II) |
| **scikit-opt** | MIT | GA, PSO, ant colony |

**Agent evolution pattern:**
1. Spawn N variants of an agent (different configs)
2. Fitness function = task success rate
3. The best are cloned and mutated
4. The worst are killed
5. Repeat → agents optimize themselves automatically

---

## 11. Layer 9 -- High-Performance I/O

**Goal:** Inter-agent communication and log streaming with io_uring for maximum performance.

### Selected Tools

| Tool | License | Role |
|------|---------|------|
| **Apache Iggy** | Apache 2.0 | io_uring message streaming (millions msg/s) |
| **Monoio** (ByteDance) | MIT/Apache 2.0 | Thread-per-core Rust async runtime |
| **io-uring crate** | MIT/Apache 2.0 | Low-level Rust io_uring bindings |
| **Seastar** | Apache 2.0 | Thread-per-core C++ framework (ScyllaDB, Redpanda) |
| **TigerBeetle** | Apache 2.0 | io_uring architectural reference |

### The Pattern That Works

All the highest-performance systems (ScyllaDB, Redpanda, Iggy, TigerBeetle) use:
```
Thread-per-core + io_uring + shared-nothing + message passing between threads
```

### Apache Iggy for Hive

Persistent message streaming in Rust, rebuilt in v0.6 with io_uring:
- Millions of messages/second
- QUIC, TCP, WebSocket, HTTP
- Apache 2.0 (Apache Incubating)
- Perfect for: inter-agent event bus, log streaming, audit trail

### Note on Node.js/Go

- **Node.js:** io_uring disabled by default (security vulnerability). Not recommended.
- **Go:** Goroutines are incompatible with the thread-per-core model. Limited gains.
- **Rust:** The sweet spot for io_uring. Monoio outperforms NGINX by ~20%.

---

## 12. Integration Roadmap

### Phase 1: Foundation (Months 1-3, MVP)

| Priority | Technology | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | Native MCP (TypeScript SDK + Python SDK) | 3 weeks | Every agent = MCP server |
| P0 | NATS embedded for messaging | 2 weeks | Inter-agent communication |
| P0 | pgvector + pgvectorscale | 1 week | Shared neural memory (zero infra) |
| P0 | **Fork A2A SDKs → @hive/a2a-sdk core** | 2 weeks | Fork TS+Python, mono-repo structure, CI upstream sync |
| P1 | SPIFFE/SPIRE for identity | 2 weeks | Automatic inter-agent mTLS |
| P1 | **@hive/a2a-sdk: Noise E2E + SPIFFE** | 2 weeks | Native E2E encryption + identity in the SDK |
| P1 | Sigstore/Cosign | 1 week | Agent image verification |
| P1 | OpenTelemetry instrumentation | 2 weeks | Basic tracing |
| P1 | Casbin for dashboard RBAC | 1 week | Fix existing auth gap |

### Phase 2: Intelligence (Months 3-6, Post-Launch)

| Priority | Technology | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | **@hive/a2a-sdk: Schema Enforcement + Anti-injection** | 3 weeks | LlamaFirewall + schema validation integrated in SDK |
| P0 | **@hive/a2a-sdk: Capability tokens + Audit** | 2 weeks | Tenuo + hash-chain audit in the SDK |
| P0 | WASM Tier 1 (Wasmtime + Extism) | 4 weeks | Lightweight agents <5ms |
| P1 | Loro CRDTs for shared state | 3 weeks | Conflict-free shared state |
| P1 | OPA policy engine | 2 weeks | Inter-agent policy enforcement |
| P1 | LanceDB per-agent embedded | 2 weeks | Fast local memory |
| P1 | **@hive/a2a-sdk: publish to npm + PyPI** | 1 week | Publicly available SDK, external adoption |
| P2 | memberlist gossip discovery | 2 weeks | Decentralized agent discovery |
| P2 | Handoff + Graph workflow patterns | 3 weeks | Multi-agent orchestration |

### Phase 3: Security & Performance (Months 6-9)

| Priority | Technology | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | Tetragon eBPF enforcement | 3 weeks | Kernel-level security |
| P0 | Cilium network policies | 3 weeks | L3-L7 agent network control |
| P1 | SpiceDB/OpenFGA authorization | 3 weeks | Fine-grained permissions |
| P1 | Tenuo capability tokens | 2 weeks | Task-scoped agent auth |
| P1 | ClickHouse + Jaeger for tracing | 3 weeks | Causal tracing at scale |
| P2 | Falco security alerting | 2 weeks | Detection rules |
| P2 | Kepler energy monitoring | 1 week | Per-agent energy metrics |

### Phase 4: Advanced (Months 9-12, Enterprise)

| Priority | Technology | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | KAI Scheduler + HAMi (GPU) | 4 weeks | Fractional GPU scheduling |
| P1 | Confidential Computing (CoCo) | 4 weeks | Hardware-encrypted agents |
| P1 | Stigmergic coordination layer | 3 weeks | Self-organizing agents |
| P1 | Semantic Watchdog agent | 4 weeks | AI securing AI |
| P2 | Evolutionary agent optimization | 3 weeks | Auto-optimizing configs |
| P2 | Apache Iggy message streaming | 3 weeks | Millions msg/s io_uring |
| P2 | Consensus voting (Raft) | 2 weeks | Multi-agent quality gates |

### Phase 5: Endgame (Year 2+)

- Agent mesh via libp2p for multi-site WAN
- CXL 3.0 memory pooling (when hardware arrives)
- Automatic causal inference (CausalNex)
- Formal verification of workflows (model checking)

---

## 13. Deployment & Developer Experience (DX)

**Goal:** Any developer must be able to launch Hive in < 5 min. Any team must be able to go to production in < 1 day. The best self-hosted tools (Coolify, Supabase, Plausible) have proven that deployment DX is a decisive adoption factor.

### `hive` CLI (Phase 1)

| Command | Role |
|---------|------|
| `hive init` | Interactive wizard: generates `.env`, Ed25519 keys, federation secret, ENCRYPTION_KEY, AUTH_SECRET. Validates prerequisites (Docker, Node, ports). |
| `hive doctor` | Full diagnostic: Postgres connected, Redis accessible, GPU detected (Ollama), DNS resolved, TLS certs valid, missing env vars. |
| `hive upgrade` | Pulls the latest image, applies DB migrations (Drizzle), migrates config if the env schema has changed. Auto-rollback on failure. |
| `hive federation init` | Generates the Ed25519 key pair, displays the public key to share, validates connectivity to configured peers. |
| `hive manifest sign` | Signs a `peers.json` file with the Ed25519 private key → produces `{ payload, sigHex }` ready to host on CDN. |
| `hive status` | Summary view: services up/down, federated peers, last manifest error, active agents, version. |

### One-Click Deploy Templates (Phase 1-2)

| Platform | Format | Content |
|----------|--------|---------|
| **Docker Compose** | `docker-compose.yml` + `.env.example` | Hive + Postgres + Redis + Ollama. Healthchecks, restart policies, named volumes. |
| **Railway / Render** | `railway.toml` / `render.yaml` | One-click template with pre-filled variables, Postgres addon, Redis addon. |
| **Coolify** | Docker Compose compatible | Deployment from Git repo, auto-SSL, native UI. |
| **Helm Chart** | `charts/hive/` | K8s: Deployment, Service, Ingress, PVC, ConfigMap, Secret. Documented Values.yaml. Optional HPA. |

### First-Run Wizard (Phase 2)

On first launch (empty DB), Hive displays a web wizard:

1. **Admin account** — email + password
2. **Instance config** — instance name, public URL (AUTH_URL)
3. **AI backend** — auto-detect local Ollama, or enter external API key
4. **Federation** (optional) — enable, paste peers, generate keys
5. **Summary** — `.env` generated, `hive doctor` executed, all green → dashboard

### DX Principles

- **Zero-config dev**: `npm run dev` works with SQLite/in-memory if Postgres/Redis are absent (explicit degraded mode).
- **Fail loud**: Any missing variable in production → crash at boot with clear message (already implemented via `env.ts` Zod).
- **Documented upgrade path**: Each major release includes a migration guide. `hive upgrade` automates as much as possible.
- **Built-in observability**: `/api/health` (liveness), `/api/ready` (readiness with DB/Redis/GPU checks), `/.well-known/hive-mesh.json` (discovery).

### Estimated Effort

| Component | Effort | Phase |
|-----------|--------|-------|
| `hive init` + `hive doctor` CLI | 2 weeks | Phase 1 |
| Production-ready Docker Compose template | 1 week | Phase 1 |
| First-run web wizard | 2 weeks | Phase 2 |
| Helm chart | 2 weeks | Phase 2 |
| `hive upgrade` + auto migration | 2 weeks | Phase 2 |
| Railway/Render/Coolify templates | 1 week | Phase 2 |

---

## 14. Crypto Stack

**Complete cryptographic stack for Hive. No invented crypto, only proven primitives.**

| Need | Tool | Detail |
|------|------|--------|
| **Agent identity** | Ed25519 | Keypair per agent. Signature on every message. |
| **E2E communication** | Noise Protocol | 1 round-trip handshake, forward secrecy. Used by Signal. |
| **Crypto library** | libsodium | Wrapper for all primitives. Impossible to misuse. |
| **Audit trail** | Hash Chain + Merkle Tree | Each event hash(E + hash(E-1)). Immutable, verifiable. |
| **Inter-agent auth** | SPIFFE/SPIRE | Short-TTL X.509 certificates, auto rotation. Apache 2.0. |
| **Internal PKI** | step-ca | Private CA. Short-lived certs. Apache 2.0. |
| **Data at rest** | AES-256-GCM | Already used by Hive for secrets. |
| **Image verification** | Sigstore/Cosign | Container image signatures. Apache 2.0. |
| **Hardware attestation** | VirTEE libs | Remote attestation SEV-SNP/TDX. Apache 2.0. |

### What Is WRONG in the Original Conversation

> "Firecracker supports vTPMs"

**No.** For hardware attestation, use:
- AMD SEV-SNP / Intel TDX via Confidential Containers (QEMU or Cloud Hypervisor backend)
- VirTEE Rust libs for programmatic attestation
- No vTPM in Firecracker

### Blockchain: Verdict

- **For Hive internal:** NO. Hash chain + Merkle tree + Ed25519 = 90% of the guarantees, 0% of the complexity.
- **For a universal inter-agent protocol:** MAYBE, in 2+ years, if decentralized identity without a central authority is needed.
- **Reference:** Certificate Transparency (Google) and Sigstore do exactly this -- blockchain-inspired, not blockchain.

---

## Summary: What Nobody Else Has

Hive's unique combination:

```
@hive/a2a-sdk                  →  The best A2A SDK in the world (fork + native security)
eBPF kernel monitoring         →  Zero-overhead observability
Firecracker + WASM dual tier   →  Isolation + performance
MCP + A2A native               →  Universal interoperability
CRDTs + pgvector               →  Conflict-free collective memory
SPIFFE + Tenuo + OPA           →  Zero-trust capability-based
Stigmergy + consensus          →  Emergent swarm intelligence
Confidential Computing         →  Hardware-encrypted agents
```

### The `@hive/a2a-sdk` Moat

```
Everyone uses A2A               →  Hive is compatible with everyone
Nobody has native security       →  Hive is the only secure-by-default A2A SDK
The SDK is open-source           →  Massive adoption, external contributions
Advanced features are Pro        →  Revenue without breaking compatibility
The more SDK users we have       →  The more the A2A standard grows
The more the standard grows      →  The more relevant Hive becomes
```

**It is a flywheel: the open-source SDK fuels standard adoption, which fuels Hive adoption.**

**No competitor has assembled this stack in this way.**

It is not just a good product. It is infrastructure that nobody else has built, with the agent-to-agent SDK that everyone will want to use.
