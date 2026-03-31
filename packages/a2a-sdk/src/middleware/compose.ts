import type { MiddlewareContext, Middleware, MiddlewareFn } from './types.js';

/**
 * Compose an array of Middleware objects into a single function.
 * Middlewares are sorted by priority (ascending) and disabled ones are skipped.
 *
 * Follows the onion model: each middleware can run code before and after next().
 */
export function compose<T extends MiddlewareContext>(
  middlewares: Middleware<T>[],
): MiddlewareFn<T> {
  const sorted = [...middlewares]
    .filter((m) => m.enabled)
    .sort((a, b) => a.priority - b.priority);

  return async function composed(ctx: T, next: () => Promise<void>): Promise<void> {
    let index = -1;

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times in middleware');
      }
      index = i;

      if (i === sorted.length) {
        await next();
        return;
      }

      const mw = sorted[i]!;
      if (!mw.enabled) {
        await dispatch(i + 1);
        return;
      }

      await mw.execute(ctx, () => dispatch(i + 1));
    }

    await dispatch(0);
  };
}
