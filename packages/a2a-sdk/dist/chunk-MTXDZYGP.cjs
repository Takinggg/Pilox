'use strict';

var sha256 = require('@noble/hashes/sha256');

// src/audit/hash-chain.ts
var encoder = new TextEncoder();
var GENESIS_SEED = "hive-audit-genesis-v1";
function genesisHash() {
  return bytesToHex(sha256.sha256(encoder.encode(GENESIS_SEED)));
}
function computeEntryHash(entry) {
  const data = [
    entry.prevHash,
    String(entry.sequence),
    entry.timestamp,
    entry.agentId,
    entry.taskId,
    entry.action,
    JSON.stringify(entry.payload)
  ].join("|");
  return bytesToHex(sha256.sha256(encoder.encode(data)));
}
var HashChain = class _HashChain {
  constructor(store, lastEntry) {
    this.store = store;
    if (lastEntry) {
      this.lastHash = lastEntry.entryHash;
      this.sequence = lastEntry.sequence + 1;
    } else {
      this.lastHash = genesisHash();
      this.sequence = 0;
    }
  }
  lastHash;
  sequence;
  /** Initialize from store state */
  static async fromStore(store) {
    const latest = await store.getLatest();
    return new _HashChain(store, latest);
  }
  /** Append a new entry to the chain */
  async append(agentId, taskId, action, payload) {
    const partial = {
      sequence: this.sequence,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      agentId,
      taskId,
      action,
      payload,
      prevHash: this.lastHash
    };
    const entryHash = computeEntryHash(partial);
    const entry = { ...partial, entryHash };
    await this.store.append(entry);
    this.lastHash = entryHash;
    this.sequence++;
    return entry;
  }
  /** Verify the chain integrity */
  async verify() {
    return this.store.verify();
  }
  getLastHash() {
    return this.lastHash;
  }
  getNextSequence() {
    return this.sequence;
  }
};
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/audit/stores/memory.ts
var InMemoryAuditStore = class {
  entries = [];
  async append(entry) {
    this.entries.push({ ...entry });
  }
  async getLatest() {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }
  async verify(fromSequence = 0, toSequence) {
    const end = toSequence ?? this.entries.length - 1;
    let expectedPrevHash = fromSequence === 0 ? genesisHash() : void 0;
    for (let i = fromSequence; i <= end && i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (expectedPrevHash !== void 0 && entry.prevHash !== expectedPrevHash) {
        return false;
      }
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
  getAll() {
    return [...this.entries];
  }
  /** Clear all entries (for testing) */
  clear() {
    this.entries = [];
  }
};

exports.HashChain = HashChain;
exports.InMemoryAuditStore = InMemoryAuditStore;
exports.computeEntryHash = computeEntryHash;
exports.genesisHash = genesisHash;
