import { describe, it, expect } from 'vitest';
import { createSchemaMiddleware } from '../../../src/security/schema/validator.js';
import type { ServerMiddlewareContext } from '../../../src/middleware/types.js';
import type { AgentCard } from '../../../src/core/types.js';

function createServerCtx(method: string, params: unknown): ServerMiddlewareContext {
  return {
    requestId: 'test-req-1',
    timestamp: Date.now(),
    localAgentCard: { name: 'test', url: 'http://localhost', version: '1.0.0' } as AgentCard,
    metadata: new Map(),
    noiseSessionActive: false,
    direction: 'inbound' as const,
    method,
    params,
  };
}

describe('createSchemaMiddleware', () => {
  it('allows valid message/send params in strict mode', async () => {
    const mw = createSchemaMiddleware({ mode: 'strict' });
    const ctx = createServerCtx('message/send', {
      message: {
        kind: 'message',
        role: 'user',
        messageId: 'msg-1',
        parts: [{ kind: 'text', text: 'hello' }],
      },
    });

    let nextCalled = false;
    await mw.execute(ctx, async () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(ctx.error).toBeUndefined();
  });

  it('rejects invalid params in strict mode', async () => {
    const mw = createSchemaMiddleware({ mode: 'strict' });
    const ctx = createServerCtx('message/send', {
      message: { role: 'invalid_role' },
    });

    let nextCalled = false;
    await mw.execute(ctx, async () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.message).toContain('Schema validation failed');
  });

  it('warns but continues in warn mode', async () => {
    const mw = createSchemaMiddleware({ mode: 'warn' });
    const ctx = createServerCtx('message/send', {
      message: { role: 'invalid_role' },
    });

    let nextCalled = false;
    await mw.execute(ctx, async () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(ctx.error).toBeUndefined();
  });

  it('passes through for unknown methods', async () => {
    const mw = createSchemaMiddleware({ mode: 'strict' });
    const ctx = createServerCtx('custom/method', { anything: true });

    let nextCalled = false;
    await mw.execute(ctx, async () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('is disabled in off mode', () => {
    const mw = createSchemaMiddleware({ mode: 'off' });
    expect(mw.enabled).toBe(false);
  });

  it('has correct priority', () => {
    const mw = createSchemaMiddleware();
    expect(mw.priority).toBe(400);
    expect(mw.name).toBe('pilox:schema-validation');
  });
});
