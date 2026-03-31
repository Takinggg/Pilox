// Root exports: common types + Pilox constructors
export { PiloxA2AServer } from './server/pilox-server.js';
export { PiloxA2AClient } from './client/pilox-client.js';

// Re-export core types for drop-in compatibility
export * from './core/types.js';
export type { A2AResponse } from './core/a2a_response.js';
export { AGENT_CARD_PATH, HTTP_EXTENSION_HEADER } from './core/constants.js';
export { Extensions, type ExtensionURI } from './core/extensions.js';

// Config types
export type {
  PiloxServerConfig,
  PiloxClientConfig,
  NoiseConfig,
  SigningConfig,
  SchemaEnforcementConfig,
  RateLimitConfig,
  CircuitBreakerConfig,
  AuditConfig,
  AuditEntry,
  AuditStore,
  GuardConfig,
} from './config/types.js';
