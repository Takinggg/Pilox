import type { AgentCard } from '../core/types.js';
import type { AgentExecutor } from '../core/server/agent_execution/agent_executor.js';
import type { TaskStore } from '../core/server/store.js';
import type { Middleware, ServerMiddlewareContext } from '../middleware/types.js';

// === Noise Protocol Config ===

export interface NoiseKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface NoiseConfig {
  /** Static key pair for Noise IK. Auto-generated if not provided. */
  staticKeyPair?: NoiseKeyPair;
  /** Key discovery method. Default: 'agent-card' */
  keyDiscovery?: 'agent-card' | 'manual';
  /** Manual remote keys map (agentUrl -> publicKey) */
  remoteStaticKeys?: Map<string, Uint8Array>;
  /** Pad messages to fixed size. Default: false */
  paddingEnabled?: boolean;
  /** Padding target size in bytes. Default: 4096 */
  paddingSize?: number;
}

// === Ed25519 Signing Config ===

export interface SigningKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SigningConfig {
  /** Ed25519 key pair. Auto-generated if not provided. */
  keyPair?: SigningKeyPair;
  /** Verify remote Agent Card signatures. Default: true */
  verifyRemoteCards?: boolean;
  /** Trusted public keys (agentUrl -> Ed25519 pubkey). Empty = TOFU model. */
  trustedKeys?: Map<string, Uint8Array>;
}

// === Schema Enforcement Config ===

export interface SchemaEnforcementConfig {
  /** 'strict' rejects bad messages, 'warn' logs only, 'off' disables. Default: 'strict' */
  mode?: 'strict' | 'warn' | 'off';
  /** Validate response messages too. Default: true */
  validateResponses?: boolean;
}

// === Rate Limiting Config ===

export interface RateLimitConfig {
  /** Max requests per window. Default: 100 */
  maxRequests?: number;
  /** Window size in ms. Default: 60000 */
  windowMs?: number;
  /** Strategy: 'agent-id' or 'ip'. Default: 'agent-id' */
  strategy?: 'agent-id' | 'ip';
}

// === Circuit Breaker Config ===

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Failures before opening. Default: 5 */
  failureThreshold?: number;
  /** Time before half-open attempt (ms). Default: 30000 */
  resetTimeoutMs?: number;
  /** Successes in half-open before closing. Default: 2 */
  halfOpenSuccessThreshold?: number;
  /** Callback on state change */
  onStateChange?: (agentId: string, from: CircuitState, to: CircuitState) => void;
}

// === Audit Config ===

export interface AuditEntry {
  sequence: number;
  timestamp: string;
  agentId: string;
  taskId: string;
  action: string;
  payload: Record<string, unknown>;
  prevHash: string;
  entryHash: string;
  signature?: string;
}

export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  getLatest(): Promise<AuditEntry | null>;
  verify(fromSequence?: number, toSequence?: number): Promise<boolean>;
}

export interface AuditConfig {
  /** Backing store. Default: InMemoryAuditStore */
  store?: AuditStore;
  /** Actions to include. Empty = all. */
  includeActions?: string[];
  /** Actions to exclude. */
  excludeActions?: string[];
}

// === Guard Config (Phase 2) ===

export interface GuardConfig {
  /** LlamaFirewall endpoint URL */
  endpoint: string;
  /** Timeout per scan in ms. Default: 5000 */
  timeoutMs?: number;
}

// === Main Server Config ===

export interface PiloxServerConfig {
  /** Agent card describing this agent */
  agentCard: AgentCard;
  /** Agent executor for handling logic */
  agentExecutor: AgentExecutor;
  /** Task persistence store. Default: InMemoryTaskStore */
  taskStore?: TaskStore;

  // Security layers (all enabled by default, set false to disable)
  noise?: NoiseConfig | false;
  signing?: SigningConfig | false;
  schemaEnforcement?: SchemaEnforcementConfig | false;
  rateLimit?: RateLimitConfig | false;
  circuitBreaker?: CircuitBreakerConfig | false;
  audit?: AuditConfig | false;
  guard?: GuardConfig | false;

  /** Additional middleware */
  middleware?: Middleware<ServerMiddlewareContext>[];
}

// === Main Client Config ===

export interface PiloxClientConfig {
  noise?: NoiseConfig | false;
  signing?: SigningConfig | false;
  schemaEnforcement?: SchemaEnforcementConfig | false;
  rateLimit?: RateLimitConfig | false;
  circuitBreaker?: CircuitBreakerConfig | false;
  audit?: AuditConfig | false;
}
