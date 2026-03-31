# ADR: DHT directory records vs P1 HTTP registry

**Status:** accepted (design only — **not implemented** in Hive Node/registry HTTP).  
**Date:** 2026-03-22  
**Context:** [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md), issue [#3](https://github.com/Takinggg/Hive/issues/3).

---

## Context

- **P1** stores authoritative **registry records** over HTTPS (`hive-registry-record-v1`), with PDP, publish readiness, and operator-controlled sync.
- **P4** describes **DHT / gossip** for discovery **without** a central list: peers need a way to resolve **handles** (or content IDs) to **dialable peers**, possibly with **multiple witnesses**.

Today the repo only publishes **hint strings** (`dhtBootstrapHints`); it does **not** store application records in a DHT.

---

## Decision

1. **Authority boundary**  
   - **P1 registry** remains the system of record for **signed registry records** (manifests, pricing metadata, etc.).  
   - A future **DHT directory** (if built) holds **routing / discovery** data only: e.g. `handle → { multiaddrs[], ttl, recordVersion }`, not a replacement for full registry payloads.

2. **Record shape (informative)**  
   - Directory values should be **signed** (Ed25519 or equivalent) with a clear **signing domain** separate from `hive-registry-record-v1` (new payload type or wrapped struct).  
   - Include **`exp` / `validUntil`**, **`seq`** or **version** for monotonic replace, and optional **witness** references (hashes to separate attestation objects) if multi-party trust is required.

3. **Trust model**  
   - **Spoofing:** clients MUST NOT trust a DHT entry without signature verification against a **known or discoverable** publisher key (e.g. same key as registrar, or a delegated mesh key in org PKI).  
   - **Eclipse:** operators MUST run **multiple bootstrap peers** and prefer **curated bootstrap lists** (as today’s hints); clients SHOULD validate **quorum** or **witness thresholds** if the design adds them.  
   - **Stale records:** honor **TTL**; treat missing or expired entries as **unknown**, fall back to **P1 HTTP** or configured HTTPS bootstrap descriptors.

4. **Implementation boundary**  
   - The reference **`services/libp2p-dht-node`** remains a **generic Kad-DHT process**; **bridging** P1 ↔ DHT (put/get adapters, validators) is a **separate** integration project with its own threat review.

---

## Consequences

- No change to current HTTP APIs until an explicit implementation issue is approved.
- Operator runbook for **hints** stays in [`MESH_DHT_OPERATOR_RUNBOOK.md`](./MESH_DHT_OPERATOR_RUNBOOK.md).
- Future work: validators in `kad-dht` record layer, replay protection, rate limits on `PUT`.

---

## References

- [`MESH_LIBP2P_DHT_NODE.md`](./MESH_LIBP2P_DHT_NODE.md)  
- [`CDC_REGISTRY_PUBLIC.md`](./CDC_REGISTRY_PUBLIC.md)  
- [`THREAT_MODEL.md`](./THREAT_MODEL.md)
