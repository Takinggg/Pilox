import type { PiloxServerConfig } from '../config/types.js';
import {
  DEFAULT_RATE_LIMIT,
  DEFAULT_CIRCUIT_BREAKER,
  DEFAULT_SCHEMA,
  DEFAULT_AUDIT,
} from '../config/defaults.js';
import { DefaultRequestHandler } from '../core/server/request_handler/default_request_handler.js';
import { InMemoryTaskStore } from '../core/server/store.js';
import type { Middleware, ServerMiddlewareContext } from '../middleware/types.js';
import { PiloxRequestHandler } from './pilox-request-handler.js';
import { createSchemaMiddleware } from '../security/schema/validator.js';
import { createRateLimitMiddleware } from './middlewares/rate-limit.js';
import { createCircuitBreakerMiddleware } from './middlewares/circuit-breaker.js';
import { createAuditMiddleware } from './middlewares/audit.js';
import { addPiloxExtensions } from '../crypto/noise/negotiation.js';
import { generateSigningKeyPair } from '../crypto/signing/ed25519.js';
import { generateNoiseKeyPair } from '../crypto/noise/handshake.js';
import type { AgentCard } from '../core/types.js';

/**
 * PiloxA2AServer -- the main entry point for creating a secure A2A server.
 * Wraps the upstream DefaultRequestHandler with the middleware pipeline.
 */
export class PiloxA2AServer {
  readonly handler: PiloxRequestHandler;
  readonly agentCard: AgentCard;

  constructor(config: PiloxServerConfig) {
    const taskStore = config.taskStore ?? new InMemoryTaskStore();
    const middlewares: Middleware<ServerMiddlewareContext>[] = [];

    // Build enhanced Agent Card with Pilox extensions
    let enhancedCard = config.agentCard;

    // Signing setup
    const signingKeyPair = config.signing !== false
      ? (config.signing?.keyPair ?? generateSigningKeyPair())
      : undefined;

    // Noise setup
    const noiseKeyPair = config.noise !== false
      ? (config.noise?.staticKeyPair ?? generateNoiseKeyPair())
      : undefined;

    // Add Pilox extensions to Agent Card
    enhancedCard = addPiloxExtensions(
      enhancedCard,
      noiseKeyPair?.publicKey,
      signingKeyPair?.publicKey,
    );

    this.agentCard = enhancedCard;

    // === Build middleware stack ===

    // Audit (priority 100) -- outermost, logs entry/exit
    if (config.audit !== false) {
      middlewares.push(createAuditMiddleware(config.audit ?? DEFAULT_AUDIT));
    }

    // Rate limiting (priority 200)
    if (config.rateLimit !== false) {
      const rlConfig = config.rateLimit === undefined ? DEFAULT_RATE_LIMIT : config.rateLimit;
      middlewares.push(createRateLimitMiddleware(rlConfig));
    }

    // Circuit breaker (priority 300)
    if (config.circuitBreaker !== false) {
      const cbConfig = config.circuitBreaker === undefined
        ? DEFAULT_CIRCUIT_BREAKER
        : config.circuitBreaker;
      middlewares.push(createCircuitBreakerMiddleware(cbConfig));
    }

    // Schema validation (priority 400)
    if (config.schemaEnforcement !== false) {
      const schemaConfig = config.schemaEnforcement === undefined
        ? DEFAULT_SCHEMA
        : config.schemaEnforcement;
      middlewares.push(createSchemaMiddleware(schemaConfig));
    }

    // Custom middleware
    if (config.middleware) {
      middlewares.push(...config.middleware);
    }

    // Create upstream handler
    const upstreamHandler = new DefaultRequestHandler(
      enhancedCard,
      taskStore,
      config.agentExecutor,
    );

    // Wrap with Pilox middleware pipeline
    this.handler = new PiloxRequestHandler(upstreamHandler, enhancedCard, middlewares);
  }
}
