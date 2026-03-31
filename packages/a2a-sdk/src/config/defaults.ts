import type {
  NoiseConfig,
  SigningConfig,
  SchemaEnforcementConfig,
  RateLimitConfig,
  CircuitBreakerConfig,
  AuditConfig,
} from './types.js';

export const DEFAULT_NOISE: NoiseConfig = {
  keyDiscovery: 'agent-card',
  paddingEnabled: false,
  paddingSize: 4096,
};

export const DEFAULT_SIGNING: SigningConfig = {
  verifyRemoteCards: true,
};

export const DEFAULT_SCHEMA: SchemaEnforcementConfig = {
  mode: 'strict',
  validateResponses: true,
};

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000,
  strategy: 'agent-id',
};

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

export const DEFAULT_AUDIT: AuditConfig = {
  // store will default to InMemoryAuditStore when not provided
};
