import { sha256 } from '@noble/hashes/sha256';
import type { AuditEntry, AuditStore } from '../config/types.js';

const encoder = new TextEncoder();
const GENESIS_SEED = 'pilox-audit-genesis-v1';

/** Compute the genesis hash */
export function genesisHash(): string {
  return bytesToHex(sha256(encoder.encode(GENESIS_SEED)));
}

/** Compute the hash for an audit entry */
export function computeEntryHash(entry: Omit<AuditEntry, 'entryHash'>): string {
  const data = [
    entry.prevHash,
    String(entry.sequence),
    entry.timestamp,
    entry.agentId,
    entry.taskId,
    entry.action,
    JSON.stringify(entry.payload),
  ].join('|');
  return bytesToHex(sha256(encoder.encode(data)));
}

/**
 * Append-only hash chain manager.
 * Wraps an AuditStore and maintains chain integrity.
 */
export class HashChain {
  private lastHash: string;
  private sequence: number;

  constructor(
    private readonly store: AuditStore,
    lastEntry?: AuditEntry | null,
  ) {
    if (lastEntry) {
      this.lastHash = lastEntry.entryHash;
      this.sequence = lastEntry.sequence + 1;
    } else {
      this.lastHash = genesisHash();
      this.sequence = 0;
    }
  }

  /** Initialize from store state */
  static async fromStore(store: AuditStore): Promise<HashChain> {
    const latest = await store.getLatest();
    return new HashChain(store, latest);
  }

  /** Append a new entry to the chain */
  async append(
    agentId: string,
    taskId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<AuditEntry> {
    const partial: Omit<AuditEntry, 'entryHash'> = {
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      agentId,
      taskId,
      action,
      payload,
      prevHash: this.lastHash,
    };

    const entryHash = computeEntryHash(partial);
    const entry: AuditEntry = { ...partial, entryHash };

    await this.store.append(entry);
    this.lastHash = entryHash;
    this.sequence++;
    return entry;
  }

  /** Verify the chain integrity */
  async verify(): Promise<boolean> {
    return this.store.verify();
  }

  getLastHash(): string {
    return this.lastHash;
  }

  getNextSequence(): number {
    return this.sequence;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
