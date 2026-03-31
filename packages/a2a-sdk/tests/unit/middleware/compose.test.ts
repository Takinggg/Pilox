import { describe, it, expect } from 'vitest';
import { compose } from '../../../src/middleware/compose.js';
import type { Middleware, MiddlewareContext } from '../../../src/middleware/types.js';
import type { AgentCard } from '../../../src/core/types.js';

function createCtx(): MiddlewareContext {
  return {
    requestId: 'test-req-1',
    timestamp: Date.now(),
    localAgentCard: { name: 'test', url: 'http://localhost', version: '1.0.0' } as AgentCard,
    metadata: new Map(),
    noiseSessionActive: false,
  };
}

function mw(name: string, priority: number, fn: (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>): Middleware<MiddlewareContext> {
  return { name, priority, enabled: true, execute: fn };
}

describe('compose', () => {
  it('calls middlewares in priority order', async () => {
    const order: string[] = [];

    const m1 = mw('a', 200, async (_, next) => { order.push('a-before'); await next(); order.push('a-after'); });
    const m2 = mw('b', 100, async (_, next) => { order.push('b-before'); await next(); order.push('b-after'); });
    const m3 = mw('c', 300, async (_, next) => { order.push('c-before'); await next(); order.push('c-after'); });

    const composed = compose([m1, m2, m3]);
    await composed(createCtx(), async () => { order.push('core'); });

    expect(order).toEqual(['b-before', 'a-before', 'c-before', 'core', 'c-after', 'a-after', 'b-after']);
  });

  it('skips disabled middlewares', async () => {
    const order: string[] = [];

    const m1 = mw('a', 100, async (_, next) => { order.push('a'); await next(); });
    const m2: Middleware<MiddlewareContext> = { name: 'b', priority: 200, enabled: false, execute: async (_, next) => { order.push('b'); await next(); } };
    const m3 = mw('c', 300, async (_, next) => { order.push('c'); await next(); });

    const composed = compose([m1, m2, m3]);
    await composed(createCtx(), async () => { order.push('core'); });

    expect(order).toEqual(['a', 'c', 'core']);
  });

  it('throws if next() called multiple times', async () => {
    const m1 = mw('double', 100, async (_, next) => {
      await next();
      await next();
    });

    const composed = compose([m1]);

    await expect(composed(createCtx(), async () => {})).rejects.toThrow('next() called multiple times');
  });

  it('calls the final next when no middlewares', async () => {
    const composed = compose<MiddlewareContext>([]);
    let called = false;
    await composed(createCtx(), async () => { called = true; });
    expect(called).toBe(true);
  });

  it('propagates errors from middleware', async () => {
    const m1 = mw('err', 100, async () => {
      throw new Error('middleware error');
    });

    const composed = compose([m1]);

    await expect(composed(createCtx(), async () => {})).rejects.toThrow('middleware error');
  });

  it('allows middleware to short-circuit without calling next', async () => {
    const order: string[] = [];

    const m1 = mw('gate', 100, async () => { order.push('gate'); /* no next */ });
    const m2 = mw('after', 200, async (_, next) => { order.push('after'); await next(); });

    const composed = compose([m1, m2]);
    await composed(createCtx(), async () => { order.push('core'); });

    expect(order).toEqual(['gate']);
  });
});
