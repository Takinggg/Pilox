import type { MiddlewareContext, Middleware, MiddlewareFn } from './types.js';
/**
 * Compose an array of Middleware objects into a single function.
 * Middlewares are sorted by priority (ascending) and disabled ones are skipped.
 *
 * Follows the onion model: each middleware can run code before and after next().
 */
export declare function compose<T extends MiddlewareContext>(middlewares: Middleware<T>[]): MiddlewareFn<T>;
//# sourceMappingURL=compose.d.ts.map