import type { AuditEntry, AuditStore } from '../../config/types.js';
/**
 * In-memory audit store for development and testing.
 * NOT suitable for production.
 */
export declare class InMemoryAuditStore implements AuditStore {
    private entries;
    append(entry: AuditEntry): Promise<void>;
    getLatest(): Promise<AuditEntry | null>;
    verify(fromSequence?: number, toSequence?: number): Promise<boolean>;
    /** Get all entries (for testing) */
    getAll(): AuditEntry[];
    /** Clear all entries (for testing) */
    clear(): void;
}
//# sourceMappingURL=memory.d.ts.map