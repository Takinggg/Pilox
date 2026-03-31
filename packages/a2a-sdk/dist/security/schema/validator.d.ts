import type { SchemaEnforcementConfig } from '../../config/types.js';
import type { Middleware, ServerMiddlewareContext } from '../../middleware/types.js';
/**
 * Create a schema validation middleware.
 * Validates incoming A2A message params against Zod schemas.
 */
export declare function createSchemaMiddleware(config?: SchemaEnforcementConfig): Middleware<ServerMiddlewareContext>;
//# sourceMappingURL=validator.d.ts.map