import type { SchemaEnforcementConfig } from '../../config/types.js';
import type { Middleware, ServerMiddlewareContext } from '../../middleware/types.js';
import { METHOD_SCHEMAS } from './schemas.js';

/**
 * Create a schema validation middleware.
 * Validates incoming A2A message params against Zod schemas.
 */
export function createSchemaMiddleware(
  config: SchemaEnforcementConfig = {},
): Middleware<ServerMiddlewareContext> {
  const mode = config.mode ?? 'strict';

  return {
    name: 'pilox:schema-validation',
    priority: 400,
    enabled: mode !== 'off',
    execute: async (ctx, next) => {
      const schema = METHOD_SCHEMAS[ctx.method];
      if (schema) {
        const result = schema.safeParse(ctx.params);
        if (!result.success) {
          const errorMsg = `Schema validation failed for ${ctx.method}: ${result.error.message}`;
          if (mode === 'strict') {
            ctx.error = new Error(errorMsg);
            return;
          }
          // warn mode: log but continue
          console.warn(`[pilox:schema] ${errorMsg}`);
        }
      }
      await next();
    },
  };
}
