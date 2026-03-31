import type { AuditEntry, AuditStore } from '../config/types.js';
/** Compute the genesis hash */
export declare function genesisHash(): string;
/** Compute the hash for an audit entry */
export declare function computeEntryHash(entry: Omit<AuditEntry, 'entryHash'>): string;
/**
 * Append-only hash chain manager.
 * Wraps an AuditStore and maintains chain integrity.
 */
export declare class HashChain {
    private readonly store;
    private lastHash;
    private sequence;
    constructor(store: AuditStore, lastEntry?: AuditEntry | null);
    /** Initialize from store state */
    static fromStore(store: AuditStore): Promise<HashChain>;
    /** Append a new entry to the chain */
    append(agentId: string, taskId: string, action: string, payload: Record<string, unknown>): Promise<AuditEntry>;
    /** Verify the chain integrity */
    verify(): Promise<boolean>;
    getLastHash(): string;
    getNextSequence(): number;
}
//# sourceMappingURL=hash-chain.d.ts.map