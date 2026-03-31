import type { AuditEntry, AuditStore } from '../../config/types.js';
import { computeEntryHash, genesisHash } from '../hash-chain.js';

/**
 * In-memory audit store for development and testing.
 * NOT suitable for production.
 */
export class InMemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async getLatest(): Promise<AuditEntry | null> {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1]! : null;
  }

  async verify(fromSequence = 0, toSequence?: number): Promise<boolean> {
    const end = toSequence ?? this.entries.length - 1;
    let expectedPrevHash = fromSequence === 0 ? genesisHash() : undefined;

    for (let i = fromSequence; i <= end && i < this.entries.length; i++) {
      const entry = this.entries[i]!;

      // Check prevHash continuity
      if (expectedPrevHash !== undefined && entry.prevHash !== expectedPrevHash) {
        return false;
      }

      // Recompute and check entryHash
      const { entryHash, ...rest } = entry;
      const computed = computeEntryHash(rest);
      if (computed !== entryHash) {
        return false;
      }

      expectedPrevHash = entryHash;
    }

    return true;
  }

  /** Get all entries (for testing) */
  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries = [];
  }
}
