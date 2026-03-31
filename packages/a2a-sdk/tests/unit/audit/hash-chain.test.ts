import { describe, it, expect } from 'vitest';
import { HashChain, genesisHash, computeEntryHash } from '../../../src/audit/hash-chain.js';
import { InMemoryAuditStore } from '../../../src/audit/stores/memory.js';

describe('genesisHash', () => {
  it('returns a deterministic genesis hash', () => {
    const h1 = genesisHash();
    const h2 = genesisHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
  });
});

describe('computeEntryHash', () => {
  it('produces deterministic hash for same input', () => {
    const entry = {
      sequence: 0,
      timestamp: '2026-01-01T00:00:00.000Z',
      agentId: 'agent-1',
      taskId: 'task-1',
      action: 'message/send',
      payload: { test: true },
      prevHash: genesisHash(),
    };

    const h1 = computeEntryHash(entry);
    const h2 = computeEntryHash(entry);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with different inputs', () => {
    const base = {
      sequence: 0,
      timestamp: '2026-01-01T00:00:00.000Z',
      agentId: 'agent-1',
      taskId: 'task-1',
      action: 'message/send',
      payload: {},
      prevHash: genesisHash(),
    };

    const h1 = computeEntryHash(base);
    const h2 = computeEntryHash({ ...base, agentId: 'agent-2' });
    expect(h1).not.toBe(h2);
  });
});

describe('HashChain', () => {
  it('appends entries with correct chain linking', async () => {
    const store = new InMemoryAuditStore();
    const chain = new HashChain(store);

    const e1 = await chain.append('agent-1', 'task-1', 'message/send', { text: 'hello' });
    expect(e1.sequence).toBe(0);
    expect(e1.prevHash).toBe(genesisHash());

    const e2 = await chain.append('agent-1', 'task-1', 'status-update', { state: 'completed' });
    expect(e2.sequence).toBe(1);
    expect(e2.prevHash).toBe(e1.entryHash);
  });

  it('verifies chain integrity', async () => {
    const store = new InMemoryAuditStore();
    const chain = new HashChain(store);

    await chain.append('agent-1', 'task-1', 'action-1', {});
    await chain.append('agent-1', 'task-1', 'action-2', {});
    await chain.append('agent-1', 'task-2', 'action-3', {});

    expect(await chain.verify()).toBe(true);
  });

  it('detects tampering', async () => {
    const store = new InMemoryAuditStore();
    const chain = new HashChain(store);

    await chain.append('agent-1', 'task-1', 'action-1', {});
    await chain.append('agent-1', 'task-1', 'action-2', {});

    // Tamper with the store
    const entries = store.getAll();
    entries[0]!.payload = { tampered: true };

    expect(await store.verify()).toBe(false);
  });

  it('initializes from existing store', async () => {
    const store = new InMemoryAuditStore();
    const chain1 = new HashChain(store);

    await chain1.append('agent-1', 'task-1', 'action-1', {});
    await chain1.append('agent-1', 'task-1', 'action-2', {});

    const chain2 = await HashChain.fromStore(store);
    const e3 = await chain2.append('agent-1', 'task-1', 'action-3', {});
    expect(e3.sequence).toBe(2);
    expect(await store.verify()).toBe(true);
  });
});
