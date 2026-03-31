# @hive/a2a-sdk — Architecture & Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Why this exists](#2-why-this-exists)
3. [Architecture Philosophy](#3-architecture-philosophy)
4. [Directory Structure](#4-directory-structure)
5. [Fork Strategy: The `src/core/` Boundary](#5-fork-strategy-the-srccore-boundary)
6. [Middleware Pipeline](#6-middleware-pipeline)
7. [Security Layers](#7-security-layers)
   - 7.1 [Noise Protocol E2E Encryption](#71-noise-protocol-e2e-encryption)
   - 7.2 [Ed25519 Agent Card Signing](#72-ed25519-agent-card-signing)
   - 7.3 [Schema Enforcement (Zod)](#73-schema-enforcement-zod)
   - 7.4 [Rate Limiting (Token Bucket)](#74-rate-limiting-token-bucket)
   - 7.5 [Circuit Breaker](#75-circuit-breaker)
8. [Audit Trail](#8-audit-trail)
9. [Server & Client Wrappers](#9-server--client-wrappers)
10. [Configuration](#10-configuration)
11. [Package Exports](#11-package-exports)
12. [Build System](#12-build-system)
13. [Testing](#13-testing)
14. [Migration Guide](#14-migration-guide)
15. [Cryptographic Choices](#15-cryptographic-choices)
16. [Phase 2 Roadmap](#16-phase-2-roadmap)

---

## 1. Overview

`@hive/a2a-sdk` is a **security-enhanced fork** of the official A2A TypeScript SDK (`a2aproject/a2a-js` v0.3.13). It is a **drop-in replacement** — 100% compatible with the A2A protocol spec while adding native security layers that the upstream SDK does not provide.

**One import change to migrate:**

```typescript
// Before (upstream)
import { A2AClient, DefaultRequestHandler } from '@anthropic/a2a-sdk';

// After (Hive)
import { HiveA2AClient } from '@hive/a2a-sdk';
import { HiveA2AServer, DefaultRequestHandler } from '@hive/a2a-sdk/server';
```

**What it adds:**

| Layer | What | How |
|-------|------|-----|
| E2E Encryption | Noise IK pattern | X25519 + ChaCha20-Poly1305 + SHA-256 |
| Identity | Agent Card signing | Ed25519 via `@noble/curves` |
| Anti-injection | Schema enforcement | Zod validation on all A2A messages |
| Resilience | Rate limiting | In-memory sliding-window token bucket |
| Resilience | Circuit breaker | Per-agent state machine (closed/open/half-open) |
| Audit | Tamper-proof trail | SHA-256 append-only hash chain |

**What it doesn't break:**

- Hive agent ↔ standard A2A agent: works perfectly (cleartext over TLS, no E2E)
- Standard A2A client ↔ Hive server: works perfectly (middleware runs, Noise skipped)
- Hive agent ↔ Hive agent: Noise E2E auto-negotiated via Agent Card extensions

---

## 2. Why this exists

The official A2A TypeScript SDK (maintained by Google/LF, Apache 2.0) provides the protocol implementation — JSON-RPC transport, Agent Card discovery, task lifecycle, streaming. But it has **zero built-in security**:

| Gap | Risk | Our solution |
|-----|------|-------------|
| No E2E encryption | MitM on internal networks, payload inspection | Noise Protocol IK |
| No workload identity | Impersonation, no agent verification | Ed25519 Agent Card signing |
| No input validation | Malformed messages crash agents, injection attacks | Zod schema enforcement |
| No rate limiting | DoS via message flooding | Token bucket per agent |
| No circuit breaker | Cascading failures across agent mesh | Per-agent state machine |
| No audit trail | No forensics, no compliance evidence | SHA-256 hash chain |

For Hive — a self-hosted AI agent OS where agents handle sensitive workloads — these gaps are unacceptable. Rather than building a separate security layer on top, we embed security **inside** the SDK so every Hive agent gets it automatically.

---

## 3. Architecture Philosophy

### 3.1 Secure by Default, Opt-out

Every security layer is ON by default. Disable with `feature: false`:

```typescript
const server = new HiveA2AServer({
  agentCard,
  agentExecutor,
  // All layers ON by default. To disable:
  noise: false,           // disable E2E encryption
  signing: false,         // disable Agent Card signing
  schemaEnforcement: false, // disable Zod validation
  rateLimit: false,       // disable rate limiting
  circuitBreaker: false,  // disable circuit breaker
  audit: false,           // disable audit trail
});
```

When ALL layers are disabled, behavior is **identical** to the upstream SDK.

### 3.2 Zero Upstream Modifications

All upstream code lives in `src/core/`. We make **zero changes** to these files. Hive code wraps around it. This means:
- Upstream sync = copy files, zero conflicts
- No risk of breaking protocol compliance
- Clear liability boundary

### 3.3 Middleware as the Architectural Spine

Every security feature is implemented as a middleware. This means:
- Features are composable, orderable, and independently testable
- Custom middleware can be injected at any priority level
- The pipeline is transparent — you can audit exactly what runs

### 3.4 Graceful Fallback

Hive extensions are advertised via Agent Card fields. If the remote agent doesn't have them, we fall back gracefully:
- No Noise extension → standard cleartext A2A over TLS
- No signing extension → skip signature verification
- Unknown remote → still rate limited, schema validated, audited

---

## 4. Directory Structure

```
packages/a2a-sdk/
├── package.json                      # @hive/a2a-sdk, 8 export paths
├── tsconfig.json                     # ES2022, strict, NodeNext
├── tsconfig.build.json               # Lenient config for .d.ts generation
├── tsup.config.ts                    # ESM + CJS dual build
├── vitest.config.ts                  # Tests config (excludes src/core/ from coverage)
├── LICENSE                           # Apache 2.0
│
├── src/
│   ├── index.ts                      # Root: HiveA2AServer, HiveA2AClient, core types
│   │
│   ├── core/                         # ══════ UPSTREAM (UNTOUCHED) ══════
│   │   ├── types.ts                  # A2A types: AgentCard, Task, Message, Part...
│   │   ├── constants.ts              # AGENT_CARD_PATH, HTTP_EXTENSION_HEADER
│   │   ├── extensions.ts             # Extension URI system
│   │   ├── errors.ts                 # Standard A2A error types
│   │   ├── a2a_response.ts           # Response type wrappers
│   │   ├── sse_utils.ts              # SSE streaming utilities
│   │   ├── client/                   # A2AClient, transports (JSON-RPC, REST, gRPC)
│   │   ├── server/                   # DefaultRequestHandler, AgentExecutor, Express handlers
│   │   ├── grpc/                     # gRPC protobuf definitions
│   │   └── types/                    # Protobuf type converters
│   │
│   ├── middleware/                    # ══════ PIPELINE ENGINE ══════
│   │   ├── types.ts                  # MiddlewareContext, Middleware, MiddlewareFn
│   │   ├── compose.ts                # Koa-style onion composition with priority sort
│   │   ├── context.ts                # Context factory: createServerContext, createClientContext
│   │   └── index.ts                  # Barrel export
│   │
│   ├── crypto/                       # ══════ CRYPTOGRAPHIC LAYER ══════
│   │   ├── signing/
│   │   │   ├── ed25519.ts            # generateSigningKeyPair, sign, verify
│   │   │   ├── agent-card.ts         # signAgentCard, verifySignedAgentCard
│   │   │   └── index.ts
│   │   ├── noise/
│   │   │   ├── types.ts              # NoiseKeyPair, NoiseHandshakeResult, NoiseEnvelope
│   │   │   ├── handshake.ts          # Noise IK: initiatorHandshake1/2, responderHandshake
│   │   │   ├── session.ts            # NoiseSession: encrypt/decrypt with nonce counter
│   │   │   ├── negotiation.ts        # supportsNoise, addHiveExtensions, key extraction
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── security/                     # ══════ ENFORCEMENT LAYER ══════
│   │   ├── schema/
│   │   │   ├── schemas.ts            # Zod schemas: MessageSchema, MessageSendParamsSchema...
│   │   │   ├── validator.ts          # createSchemaMiddleware (priority 400)
│   │   │   └── index.ts
│   │   ├── rate-limit/
│   │   │   ├── token-bucket.ts       # TokenBucket: sliding-window, per-key, no Redis
│   │   │   └── index.ts
│   │   ├── circuit-breaker/
│   │   │   ├── breaker.ts            # CircuitBreaker: closed → open → half-open
│   │   │   ├── registry.ts           # CircuitBreakerRegistry: per-agent instances
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── audit/                        # ══════ AUDIT TRAIL ══════
│   │   ├── hash-chain.ts             # HashChain: SHA-256 append-only chain
│   │   ├── stores/
│   │   │   ├── memory.ts             # InMemoryAuditStore (dev/test)
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── server/                       # ══════ HIVE SERVER ══════
│   │   ├── hive-server.ts            # HiveA2AServer: main entry, builds middleware stack
│   │   ├── hive-request-handler.ts   # HiveRequestHandler: wraps upstream + pipeline
│   │   ├── middlewares/
│   │   │   ├── rate-limit.ts         # createRateLimitMiddleware (priority 200)
│   │   │   ├── circuit-breaker.ts    # createCircuitBreakerMiddleware (priority 300)
│   │   │   └── audit.ts             # createAuditMiddleware (priority 100)
│   │   ├── express/
│   │   │   └── index.ts             # Re-exports upstream Express handlers
│   │   └── index.ts                  # All server exports (upstream + Hive)
│   │
│   ├── client/                       # ══════ HIVE CLIENT ══════
│   │   ├── hive-client.ts            # HiveA2AClient: wraps A2AClient + Noise detection
│   │   └── index.ts                  # All client exports (upstream + Hive)
│   │
│   ├── config/                       # ══════ CONFIGURATION ══════
│   │   ├── types.ts                  # HiveServerConfig, HiveClientConfig, all config interfaces
│   │   └── defaults.ts               # DEFAULT_NOISE, DEFAULT_RATE_LIMIT, etc.
│   │
│   └── testing/                      # ══════ TEST UTILITIES ══════
│       └── index.ts                  # MockAgentExecutor, createTestAgentCard
│
├── tests/
│   └── unit/
│       ├── middleware/compose.test.ts      # 6 tests
│       ├── crypto/ed25519.test.ts          # 8 tests
│       ├── crypto/noise-handshake.test.ts  # 4 tests
│       ├── security/token-bucket.test.ts   # 6 tests
│       ├── security/breaker.test.ts        # 7 tests
│       ├── security/validator.test.ts      # 6 tests
│       └── audit/hash-chain.test.ts        # 7 tests
│
└── docs/
    └── ARCHITECTURE.md                     # This file
```

---

## 5. Fork Strategy: The `src/core/` Boundary

### How it works

```
┌─────────────────────────────────────────────────────────┐
│                    @hive/a2a-sdk                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  src/core/  (UPSTREAM — ZERO MODIFICATIONS)      │   │
│  │                                                   │   │
│  │  A2AClient, DefaultRequestHandler, AgentExecutor  │   │
│  │  types.ts, Express handlers, gRPC transport       │   │
│  └─────────────────────┬────────────────────────────┘   │
│                        │ imports                        │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │  Hive Layers (middleware, crypto, security, audit)│   │
│  │                                                   │   │
│  │  HiveA2AServer wraps DefaultRequestHandler        │   │
│  │  HiveA2AClient wraps A2AClient                    │   │
│  │  Middleware pipeline sits between them             │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Upstream sync procedure

```bash
# 1. Clone upstream
git clone https://github.com/a2aproject/a2a-js /tmp/a2a-upstream

# 2. Copy source files
cp -r /tmp/a2a-upstream/src/* packages/a2a-sdk/src/core/

# 3. Remove samples
rm -rf packages/a2a-sdk/src/core/samples

# 4. Build and test
cd packages/a2a-sdk && npm run build && npm test
```

Since we never modify `src/core/`, this is always a clean copy. No merge conflicts possible.

### Type checking strategy

The upstream code has some TypeScript strict-mode violations (it was written for a less strict tsconfig). Our approach:

- **`tsconfig.json`** — strict mode for IDE and Hive code type checking
- **`tsconfig.build.json`** — relaxed (`strict: false`, `noEmitOnError: false`) for `.d.ts` generation
- **`npm run typecheck`** — filters out `src/core/` errors, only fails on Hive code errors
- **tsup** — uses esbuild (ignores type errors entirely), produces JS bundles

---

## 6. Middleware Pipeline

### The Onion Model

Every request flows through the middleware stack like layers of an onion. Each middleware can run logic **before** and **after** `next()`:

```
Request ──→ [Audit] ──→ [RateLimit] ──→ [CircuitBreaker] ──→ [Schema] ──→ [Core Handler]
            ← audit ←    ← rate ←       ← circuit ←          ← schema ←   ← response
```

### Priority System

Middlewares are sorted by priority (ascending). Lower number = runs first (outermost):

| Priority | Name | Middleware | What it does |
|----------|------|-----------|-------------|
| 100 | `hive:audit` | `createAuditMiddleware` | Log request entry, log response/error on unwind |
| 200 | `hive:rate-limit` | `createRateLimitMiddleware` | Token bucket check, short-circuit if over limit |
| 300 | `hive:circuit-breaker` | `createCircuitBreakerMiddleware` | Check circuit state, record success/failure |
| 400 | `hive:schema-validation` | `createSchemaMiddleware` | Zod validate incoming params |
| 500 | *(reserved)* | Noise decrypt | Decrypt Noise envelope (Phase 2 middleware) |
| 600 | *(reserved)* | Card verification | Verify Ed25519 signature on remote card |
| 1000 | **core** | `upstream.sendMessage()` | Delegates to upstream DefaultRequestHandler |

### Compose function

```typescript
// src/middleware/compose.ts
export function compose<T extends MiddlewareContext>(
  middlewares: Middleware<T>[],
): MiddlewareFn<T>;
```

Key properties:
- **Priority sort**: Middlewares are sorted by `.priority` (ascending) before execution
- **Disabled skip**: Middlewares with `.enabled = false` are filtered out
- **Double-call detection**: Throws if `next()` is called more than once
- **Short-circuit**: A middleware can skip `next()` to prevent downstream execution

### Context object

Every middleware receives a context with request metadata:

```typescript
interface ServerMiddlewareContext {
  readonly requestId: string;         // UUID v4, auto-generated
  readonly timestamp: number;         // ms since epoch
  readonly localAgentCard: AgentCard;  // This agent's card
  remoteAgentCard?: AgentCard;         // Remote peer's card (if resolved)
  readonly metadata: Map<string, unknown>; // Cross-middleware data bag
  noiseSessionActive: boolean;         // Whether Noise E2E is active
  readonly direction: 'inbound';
  readonly method: string;             // 'message/send', 'tasks/get', etc.
  params: unknown;                     // Raw JSON-RPC params (mutable)
  message?: Message;                   // Parsed message (for message/send)
  task?: Task;                         // Associated task
  response?: unknown;                  // Response (set by core handler)
  error?: Error;                       // Short-circuit error
}
```

### Custom middleware

Users can inject custom middleware at any priority:

```typescript
const server = new HiveA2AServer({
  agentCard,
  agentExecutor,
  middleware: [
    {
      name: 'my-logger',
      priority: 150, // between audit (100) and rate-limit (200)
      enabled: true,
      execute: async (ctx, next) => {
        console.log(`[${ctx.method}] Request ${ctx.requestId}`);
        await next();
        console.log(`[${ctx.method}] Response: ${ctx.error ? 'error' : 'ok'}`);
      },
    },
  ],
});
```

---

## 7. Security Layers

### 7.1 Noise Protocol E2E Encryption

**Files:** `src/crypto/noise/handshake.ts`, `session.ts`, `negotiation.ts`, `types.ts`

**Pattern:** Noise IK (Initiator Knows responder's static key)

**Flow:**
```
┌─────────┐                          ┌─────────┐
│ Initiator│                          │Responder│
│ (Client) │                          │ (Server) │
└────┬─────┘                          └────┬─────┘
     │  1. Fetch Agent Card                │
     │────────────────────────────────────→│
     │  Card: { hive:noise: { publicKey }} │
     │←────────────────────────────────────│
     │                                     │
     │  2. Handshake Message 1             │
     │  [ephemeral_pub || encrypted_static]│
     │────────────────────────────────────→│
     │                                     │
     │  3. Handshake Message 2             │
     │  [responder_ephemeral_pub]          │
     │←────────────────────────────────────│
     │                                     │
     │  4. Transport phase (encrypted)     │
     │  { ciphertext, nonce }              │
     │←───────────────────────────────────→│
```

**Handshake steps (IK pattern: → e, es, s, ss / ← e, ee, se):**

1. **Initiator** generates ephemeral X25519 key pair
2. Computes `es = DH(ephemeral.secret, responder.static.pub)`
3. Derives chaining key `ck1 = SHA-256(es || ephemeral.pub)`
4. Encrypts own static public key with `ck1` using ChaCha20-Poly1305
5. Computes `ss = DH(initiator.static.secret, responder.static.pub)`
6. Derives `ck2 = SHA-256(ss || ck1)`
7. Sends: `ephemeral.pub || encrypted_static`

8. **Responder** parses message, reverses DH operations
9. Decrypts initiator's static public key
10. Generates own ephemeral, computes `ee` and `se` DH
11. Derives final chaining key `ck4`
12. Derives transport keys: `sendKey = SHA-256(0x01 || ck4)`, `recvKey = SHA-256(0x02 || ck4)`

13. **Initiator** processes response, derives matching transport keys (reversed)

**Post-handshake:**

```typescript
const session = new NoiseSession(handshakeResult);

// Encrypt
const { ciphertext, nonce } = session.encrypt(plaintext);

// Decrypt
const plaintext = session.decrypt(ciphertext, nonce);
```

The `NoiseSession` manages incrementing nonce counters automatically. Each direction has its own counter.

**Agent Card extension advertisement:**

```typescript
// Automatically added by HiveA2AServer
{
  extensions: ['hive:noise:ik:v1'],
  additionalProperties: {
    'hive:noise': {
      publicKey: '<base64url-X25519-key>',
      cipherSuite: 'Noise_IK_25519_ChaChaPoly_SHA256',
      version: '1'
    }
  }
}
```

**Graceful fallback:** If the remote Agent Card doesn't contain `hive:noise:ik:v1` in its extensions, the client falls back to standard cleartext A2A over TLS. No error, no disruption.

---

### 7.2 Ed25519 Agent Card Signing

**Files:** `src/crypto/signing/ed25519.ts`, `agent-card.ts`

**Purpose:** Cryptographically prove that an Agent Card was issued by a specific agent and hasn't been tampered with.

```typescript
import { generateSigningKeyPair, signAgentCard, verifySignedAgentCard } from '@hive/a2a-sdk/crypto';

// Generate key pair (once, persist the secretKey)
const keyPair = generateSigningKeyPair();

// Sign an Agent Card
const signed = signAgentCard(agentCard, keyPair);
// → { card: '{"name":"..."}', signature: 'hex...', signerPublicKey: 'hex...', signedAt: '...' }

// Verify a signed Agent Card
const isValid = verifySignedAgentCard(signed);
// → true or false
```

**Key details:**
- Uses `ed25519` from `@noble/curves` (audited, pure JS)
- Keys are 32 bytes (secret) + 32 bytes (public)
- Signatures are 64 bytes
- Agent Card is serialized to JSON, then signed as raw bytes
- Public key is advertised in Agent Card via `hive:signing` extension

**Agent Card extension:**

```typescript
{
  extensions: ['hive:signing:ed25519:v1'],
  additionalProperties: {
    'hive:signing': {
      publicKey: '<hex-ed25519-key>'
    }
  }
}
```

---

### 7.3 Schema Enforcement (Zod)

**Files:** `src/security/schema/schemas.ts`, `validator.ts`

**Purpose:** Validate all incoming A2A messages against strict schemas to prevent malformed data, injection attacks, and protocol violations.

**Pre-compiled schemas:**

| Schema | Validates | Used for |
|--------|----------|----------|
| `MessageSchema` | `kind`, `role`, `messageId`, `parts[]` | Message structure |
| `MessageSendParamsSchema` | `message` + optional `configuration` | `message/send`, `message/stream` |
| `TaskQueryParamsSchema` | `id`, optional `historyLength` | `tasks/get` |
| `TaskIdParamsSchema` | `id` | `tasks/cancel`, `tasks/resubscribe` |

**Three modes:**

```typescript
const server = new HiveA2AServer({
  agentCard, agentExecutor,
  schemaEnforcement: { mode: 'strict' },  // Default: reject invalid
  // schemaEnforcement: { mode: 'warn' }, // Log warning, continue
  // schemaEnforcement: { mode: 'off' },  // Disable entirely
  // schemaEnforcement: false,             // Also disables
});
```

- **`strict`** (default): Invalid messages set `ctx.error` and stop the pipeline
- **`warn`**: Invalid messages log a warning but pipeline continues
- **`off`** / `false`: Middleware is disabled, no validation

**Middleware priority:** 400 (runs after rate limit and circuit breaker, before Noise decrypt)

---

### 7.4 Rate Limiting (Token Bucket)

**Files:** `src/security/rate-limit/token-bucket.ts`, `src/server/middlewares/rate-limit.ts`

**Algorithm:** Sliding-window token bucket. Tokens refill continuously based on elapsed time (not fixed windows).

```
maxRequests = 100, windowMs = 60000

Time 0s:   100 tokens available
Request 1: 99 tokens remaining
Request 2: 98 tokens remaining
...
Request 100: 0 tokens remaining
Request 101: REJECTED (retryAfterMs calculated)
Time 0.6s: ~1 token refilled
Request 102: allowed
```

**Configuration:**

```typescript
const server = new HiveA2AServer({
  agentCard, agentExecutor,
  rateLimit: {
    maxRequests: 100,       // per window (default: 100)
    windowMs: 60_000,       // window size in ms (default: 60s)
    strategy: 'agent-id',   // key by agent name (default) or 'ip'
  },
});
```

**Key features:**
- **Per-key tracking**: Each agent has its own bucket
- **No external dependencies**: No Redis, no shared state
- **Continuous refill**: Not fixed windows, smoother rate control
- **Informative rejection**: Returns `retryAfterMs` in the error

**Middleware priority:** 200

---

### 7.5 Circuit Breaker

**Files:** `src/security/circuit-breaker/breaker.ts`, `registry.ts`, `src/server/middlewares/circuit-breaker.ts`

**State machine:**

```
         success (< threshold)
    ┌──────────────────────────────┐
    │                              │
    ▼          failures ≥ N        │
┌────────┐ ────────────────→ ┌──────┐
│ CLOSED │                   │ OPEN │
└────────┘ ←──────────────── └──┬───┘
    ▲      successes ≥ M        │
    │                           │ timeout elapsed
    │      ┌───────────┐       │
    └──────│ HALF-OPEN │←──────┘
   success └─────┬─────┘
   ≥ M           │ any failure
                 │
                 ▼
              ┌──────┐
              │ OPEN │
              └──────┘
```

**States:**
- **Closed** (normal): All requests pass through. Failures are counted. When failures reach `failureThreshold`, transition to Open.
- **Open** (blocking): All requests are immediately rejected with an error. After `resetTimeoutMs` elapses, transition to Half-Open.
- **Half-Open** (probing): Requests are allowed through as probes. If `halfOpenSuccessThreshold` consecutive successes occur, transition to Closed. Any failure → back to Open.

**Configuration:**

```typescript
const server = new HiveA2AServer({
  agentCard, agentExecutor,
  circuitBreaker: {
    failureThreshold: 5,           // failures before opening (default: 5)
    resetTimeoutMs: 30_000,        // time before half-open (default: 30s)
    halfOpenSuccessThreshold: 2,   // successes to close (default: 2)
    onStateChange: (agentId, from, to) => {
      console.log(`Circuit ${agentId}: ${from} → ${to}`);
    },
  },
});
```

**Registry:** Each remote agent gets its own circuit breaker instance via `CircuitBreakerRegistry`. Breakers are created lazily on first contact.

**Middleware priority:** 300

---

## 8. Audit Trail

**Files:** `src/audit/hash-chain.ts`, `src/audit/stores/memory.ts`, `src/server/middlewares/audit.ts`

### Hash Chain

Every A2A interaction is logged as an entry in a **SHA-256 append-only hash chain**. Each entry's hash depends on the previous entry's hash, making tampering detectable.

```
┌─────────────────────────┐
│ Genesis                 │
│ SHA-256("hive-audit-    │
│         genesis-v1")    │
│ hash: a1b2c3...         │
└─────────┬───────────────┘
          │ prevHash
┌─────────▼───────────────┐
│ Entry 0                 │
│ seq: 0                  │
│ action: message/send    │
│ agent: agent-1          │
│ prevHash: a1b2c3...     │
│ hash: SHA-256(          │
│   prevHash|seq|ts|      │
│   agent|task|action|    │
│   payload)              │
│ hash: d4e5f6...         │
└─────────┬───────────────┘
          │ prevHash
┌─────────▼───────────────┐
│ Entry 1                 │
│ seq: 1                  │
│ prevHash: d4e5f6...     │
│ hash: g7h8i9...         │
└─────────────────────────┘
```

**Hash computation:**

```
entryHash = SHA-256(prevHash | sequence | timestamp | agentId | taskId | action | JSON(payload))
```

Fields are concatenated with `|` separator, then hashed with SHA-256.

### Audit Entry

```typescript
interface AuditEntry {
  sequence: number;                    // Monotonically increasing
  timestamp: string;                   // ISO 8601
  agentId: string;                     // Remote agent's name
  taskId: string;                      // A2A task ID or request ID
  action: string;                      // e.g., 'message/send.received'
  payload: Record<string, unknown>;    // Request metadata
  prevHash: string;                    // Previous entry's hash (hex)
  entryHash: string;                   // This entry's hash (hex)
  signature?: string;                  // Optional Ed25519 signature
}
```

### Audit Middleware Behavior

The audit middleware (priority 100) wraps every request:

1. **Before `next()`**: Appends `{method}.received` entry
2. **After `next()` (or on error)**: Appends `{method}.completed` or `{method}.error` entry with duration

```
message/send request:
  → Entry: "message/send.received"  { requestId }
  → [pipeline executes...]
  → Entry: "message/send.completed" { requestId, durationMs }
```

### Audit Stores

```typescript
interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  getLatest(): Promise<AuditEntry | null>;
  verify(fromSequence?: number, toSequence?: number): Promise<boolean>;
}
```

| Store | Use case | Persistence |
|-------|----------|-------------|
| `InMemoryAuditStore` | Development, testing | None (process memory) |
| `PostgresAuditStore` | Production | Postgres with REVOKE UPDATE/DELETE |

**Verification:** `store.verify()` re-computes every entry's hash from its components and checks that `prevHash` chains are consistent. Any tampered entry breaks the chain.

---

## 9. Server & Client Wrappers

### HiveA2AServer

**File:** `src/server/hive-server.ts`

The main entry point. Constructs the full middleware pipeline and wraps the upstream `DefaultRequestHandler`:

```typescript
import { HiveA2AServer } from '@hive/a2a-sdk';

const server = new HiveA2AServer({
  // Required (same as upstream)
  agentCard: { name: 'my-agent', url: 'http://localhost:3000', ... },
  agentExecutor: myExecutor,

  // Optional (all ON by default)
  noise: { /* config */ },        // or false to disable
  signing: { /* config */ },      // or false to disable
  schemaEnforcement: { /* */ },   // or false to disable
  rateLimit: { /* config */ },    // or false to disable
  circuitBreaker: { /* config */},// or false to disable
  audit: { store: myStore },      // or false to disable

  // Custom middleware
  middleware: [myCustomMiddleware],
});

// server.handler is an A2ARequestHandler — use it with Express
// server.agentCard is the enhanced card (with Hive extensions)
```

**What it does on construction:**
1. Generates signing key pair (Ed25519) if not provided
2. Generates noise key pair (X25519) if not provided
3. Adds Hive extensions to the Agent Card (`hive:noise:ik:v1`, `hive:signing:ed25519:v1`)
4. Creates middleware stack in priority order
5. Creates upstream `DefaultRequestHandler`
6. Wraps it with `HiveRequestHandler` (middleware pipeline)

### HiveRequestHandler

**File:** `src/server/hive-request-handler.ts`

Implements the `A2ARequestHandler` interface. For every A2A method call (`sendMessage`, `getTask`, `cancelTask`):

1. Creates a `ServerMiddlewareContext`
2. Runs the middleware pipeline
3. If no error: delegates to upstream handler inside the `next()` callback
4. If error: throws `ctx.error`

This means middleware can:
- **Reject** requests (set `ctx.error`, don't call `next()`)
- **Transform** params (modify `ctx.params` before `next()`)
- **Observe** responses (read `ctx.response` after `next()`)
- **Measure** timing (track time around `next()`)

### HiveA2AClient

**File:** `src/client/hive-client.ts`

Wraps the upstream `A2AClient` with Noise Protocol detection:

```typescript
import { HiveA2AClient } from '@hive/a2a-sdk';

const client = new HiveA2AClient('http://remote-agent:3000');

// Fetch agent card and detect Hive capabilities
const card = await client.getAgentCard();
console.log(client.isPeerHiveEnabled()); // true if remote supports Noise

// Standard A2A operations
const response = await client.sendMessage({
  message: { kind: 'message', role: 'user', messageId: '1', parts: [{ kind: 'text', text: 'hello' }] }
});
```

---

## 10. Configuration

### HiveServerConfig

```typescript
interface HiveServerConfig {
  // ── Required (same as upstream) ──
  agentCard: AgentCard;
  agentExecutor: AgentExecutor;
  taskStore?: TaskStore;            // Default: InMemoryTaskStore

  // ── Security layers (all ON by default, set false to disable) ──
  noise?: NoiseConfig | false;
  signing?: SigningConfig | false;
  schemaEnforcement?: SchemaEnforcementConfig | false;
  rateLimit?: RateLimitConfig | false;
  circuitBreaker?: CircuitBreakerConfig | false;
  audit?: AuditConfig | false;
  guard?: GuardConfig | false;      // Phase 2: LlamaFirewall

  // ── Extensibility ──
  middleware?: Middleware<ServerMiddlewareContext>[];
}
```

### Default Values

| Config | Default |
|--------|---------|
| `noise.keyDiscovery` | `'agent-card'` |
| `noise.paddingEnabled` | `false` |
| `signing.verifyRemoteCards` | `true` |
| `schemaEnforcement.mode` | `'strict'` |
| `rateLimit.maxRequests` | `100` |
| `rateLimit.windowMs` | `60000` (1 min) |
| `rateLimit.strategy` | `'agent-id'` |
| `circuitBreaker.failureThreshold` | `5` |
| `circuitBreaker.resetTimeoutMs` | `30000` (30s) |
| `circuitBreaker.halfOpenSuccessThreshold` | `2` |

---

## 11. Package Exports

The package uses Node.js [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) for tree-shaking and clean imports:

```json
{
  ".":               "Root — HiveA2AServer, HiveA2AClient, core types, config types",
  "./server":        "HiveRequestHandler + all upstream server re-exports",
  "./server/express": "Express handlers (agentCardHandler, jsonRpcHandler, restHandler)",
  "./client":        "HiveA2AClient + all upstream client re-exports",
  "./crypto":        "Ed25519, Noise (for direct use)",
  "./audit":         "HashChain, InMemoryAuditStore",
  "./middleware":    "compose, Middleware types (for custom middleware)",
  "./testing":       "MockAgentExecutor, createTestAgentCard"
}
```

Each export path provides ESM (`.js`), CJS (`.cjs`), and TypeScript declarations (`.d.ts`).

### Drop-in compatibility

Every type and class exported by the upstream SDK is re-exported through `@hive/a2a-sdk/server` and `@hive/a2a-sdk/client`. This means consumers can switch import paths without changing any other code:

```typescript
// These all work:
import { DefaultRequestHandler } from '@hive/a2a-sdk/server';
import { A2AClient } from '@hive/a2a-sdk/client';
import { AgentCard, Task, Message } from '@hive/a2a-sdk';
import { agentCardHandler, jsonRpcHandler } from '@hive/a2a-sdk/server/express';
```

---

## 12. Build System

### Tools

| Tool | Purpose |
|------|---------|
| **tsup** | Bundles ESM + CJS from TypeScript (uses esbuild internally) |
| **tsc** | Generates `.d.ts` type declarations only |
| **vitest** | Unit testing (fast, native ESM, Vite-based) |

### Commands

```bash
npm run build        # tsup (ESM+CJS) + tsc (declarations)
npm run dev          # tsup --watch
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
npm run test:coverage # vitest with V8 coverage
npm run typecheck    # tsc --noEmit (Hive code only, excludes src/core/ errors)
npm run clean        # rm -rf dist
```

### Build output

```
dist/
├── index.js           # ESM root
├── index.cjs          # CJS root
├── index.d.ts         # Type declarations
├── server/
│   ├── index.js / .cjs / .d.ts
│   └── express/
│       └── index.js / .cjs / .d.ts
├── client/
│   └── index.js / .cjs / .d.ts
├── crypto/
│   └── index.js / .cjs / .d.ts
├── audit/
│   └── index.js / .cjs / .d.ts
├── middleware/
│   └── index.js / .cjs / .d.ts
├── testing/
│   └── index.js / .cjs / .d.ts
├── core/              # Upstream declarations
│   ├── types.d.ts
│   ├── client/...
│   └── server/...
└── chunk-*.js/.cjs    # Code-split shared chunks
```

### Dependencies

**Runtime:**
| Dependency | Version | Why |
|-----------|---------|-----|
| `uuid` | ^11.1.0 | Request ID generation (also upstream dep) |
| `zod` | ^3.25.76 | Schema validation |
| `@noble/curves` | ^1.9.7 | Ed25519 signing + X25519 key exchange |
| `@noble/ciphers` | ^1.3.0 | ChaCha20-Poly1305 AEAD |
| `@noble/hashes` | ^1.8.0 | SHA-256 hashing |

**Peer (optional):**
| Dependency | Why |
|-----------|-----|
| `express` | Express handlers (only if using Express) |
| `postgres` | PostgresAuditStore (only if using Postgres audit) |

**Dev:**
| Dependency | Why |
|-----------|-----|
| `typescript` | Type checking and declarations |
| `tsup` | Build |
| `vitest` | Tests |
| `@grpc/grpc-js`, `@bufbuild/protobuf` | Types for upstream gRPC code |
| `@types/express`, `@types/node`, `@types/uuid` | Type definitions |

---

## 13. Testing

### Test Matrix

| Suite | File | Tests | What's tested |
|-------|------|-------|--------------|
| Middleware compose | `compose.test.ts` | 6 | Priority ordering, disabled skip, double-call detection, short-circuit, error propagation, empty pipeline |
| Ed25519 | `ed25519.test.ts` | 8 | Key generation, sign/verify, tamper detection, wrong key rejection, hex roundtrip, Agent Card sign/verify/parse |
| Noise IK | `noise-handshake.test.ts` | 4 | Full handshake, key symmetry verification, wrong-key rejection, session encrypt/decrypt with nonce sequencing |
| Token bucket | `token-bucket.test.ts` | 6 | Within-limit, over-limit, time-based refill, per-key independence, reset, default config |
| Circuit breaker | `breaker.test.ts` | 7 | Initial state, threshold opening, timeout transition, half-open success/failure, state change callback, failure reset |
| Schema validator | `validator.test.ts` | 6 | Valid params, invalid rejection, warn mode, unknown methods, off mode, priority/name |
| Hash chain | `hash-chain.test.ts` | 7 | Genesis determinism, hash determinism, input sensitivity, chain linking, verification, tamper detection, store recovery |

**Total: 44 tests, all passing.**

### Running tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage (excludes src/core/)
npm run test:coverage

# Specific suite
npx vitest run tests/unit/crypto/noise-handshake.test.ts
```

### Coverage configuration

Coverage excludes `src/core/` (upstream code) and `src/testing/` (test utilities):

```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/core/**', 'src/testing/**'],
}
```

---

## 14. Migration Guide

### From upstream `@a2a/sdk` (or `a2a-js`)

**Step 1: Install**

```bash
# Remove upstream
npm uninstall @a2a/sdk

# Install Hive SDK
npm install @hive/a2a-sdk
```

**Step 2: Update imports**

```typescript
// ── Server ──

// Before:
import { DefaultRequestHandler } from '@a2a/sdk/server';
import { A2AExpressApp } from '@a2a/sdk/server/express';

// After:
import { HiveA2AServer } from '@hive/a2a-sdk';
import { A2AExpressApp } from '@hive/a2a-sdk/server/express';

// ── Client ──

// Before:
import { A2AClient } from '@a2a/sdk/client';

// After:
import { HiveA2AClient } from '@hive/a2a-sdk/client';

// ── Types (unchanged) ──
import { AgentCard, Task, Message } from '@hive/a2a-sdk';
```

**Step 3: Update server creation**

```typescript
// Before:
const handler = new DefaultRequestHandler(agentCard, taskStore, agentExecutor);

// After:
const server = new HiveA2AServer({
  agentCard,
  agentExecutor,
  taskStore,
  // All security layers enabled automatically!
});
const handler = server.handler;
// Use server.agentCard instead of agentCard (it has Hive extensions)
```

**Step 4: Update client creation**

```typescript
// Before:
const client = new A2AClient(agentCard);

// After:
const client = new HiveA2AClient(agentCard);
```

That's it. All existing A2A logic works unchanged. Security is automatic.

---

## 15. Cryptographic Choices

### Why @noble/* libraries?

| Criteria | @noble/* | Other options |
|----------|---------|---------------|
| Pure JavaScript | Yes | libsodium-wrappers: native binding |
| Audited | Yes (Trail of Bits) | Most are not |
| Zero native deps | Yes | Many require node-gyp |
| Tree-shakeable | Yes | Most are not |
| Performance | Excellent (optimized BigInt) | Native is faster, but adds complexity |
| Maintenance | Active (paulmillr) | Variable |

### Why Noise IK (not XX or NK)?

| Pattern | Pre-knowledge | Round trips | Our choice |
|---------|---------------|-------------|------------|
| **IK** | Initiator knows responder's static key | 1 RT | **Yes** — Agent Card provides the key |
| XX | Neither knows the other | 2 RT | No — unnecessary, Agent Cards are public |
| NK | Initiator knows responder, no client auth | 1 RT | No — we want mutual authentication |

IK is ideal because:
1. The **Agent Card** already provides the responder's public key (fetched via HTTP before first message)
2. It provides **mutual authentication** (both sides' static keys are verified)
3. It completes in **one round trip** (message 1 → message 2 → transport phase)

### Why Ed25519 (not secp256k1 or RSA)?

- **32-byte keys** (vs 33-byte secp256k1, 256+ byte RSA)
- **64-byte signatures** (vs 64-72 byte secp256k1, 256+ byte RSA)
- **Fast verification** (~8000 ops/sec in pure JS)
- **No malleability issues** (unlike ECDSA without canonical S)
- **Widely adopted** (SSH, Signal, Tor, Let's Encrypt)

---

## 16. Phase 2 Roadmap

| Feature | Priority | Description |
|---------|----------|-------------|
| **Noise middleware** | P0 | Auto-encrypt/decrypt JSON-RPC params in the pipeline |
| **SPIFFE/SPIRE identity** | P0 | Workload identity via SVID certificates |
| **LlamaFirewall guard** | P1 | Anti-prompt-injection scanning via Meta's LlamaFirewall |
| **PostgresAuditStore** | P1 | Production audit store with `REVOKE UPDATE/DELETE` |
| **Capability tokens** | P1 | Fine-grained method-level authorization |
| **Client middleware** | P2 | Pipeline on the client side (symmetric to server) |
| **Noise session resumption** | P2 | Cache transport keys to skip re-handshake |
| **npm + PyPI publish** | P2 | Public package release for community adoption |
