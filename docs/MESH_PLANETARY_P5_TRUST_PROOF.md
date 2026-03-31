# P5 — Progressive Trust (`proof` hook)

> **Goal**: prepare the **attestation field** on the directory record without yet requiring full DID / VC (cf. [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1, milestone P5).

## JSON Schema

[`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json) — **optional** `proof` property (`additionalProperties: true`) including notably:

- `type`, `signer` (URI), `signingKid`, `sigHex` (128 hex = Ed25519 signature over 64 bytes).

> **DID / W3C Credentials (VC)**: the **`hive-registry-record-ed25519-v1`** proof covers the authenticity of the **registry record**. The schema optionally supports **`controllerDid`** and **`didDocumentUrl`** for DID Core alignment; detailed **VC** issuance / verification remains the operator's responsibility (not in this stub). P4 sync can require record proof (`REGISTRY_SYNC_VERIFY_ED25519_PROOF`) and **catalog** proof (`REGISTRY_SYNC_VERIFY_CATALOG`).

**PDP-lite (stub)**: **`REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST`** and **`REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST`** enforce operator policy on **`POST /v1/records`** before persistence (complements cryptographic proof).

## Ed25519 verification (registry stub)

When **`REGISTRY_VERIFY_ED25519_PROOF=1`** on [`services/registry`](../services/registry/):

- If `proof.sigHex` is absent: no crypto verification (proof is optional).
- If `proof.sigHex` is present: **`type`** must be **`hive-registry-record-ed25519-v1`**, **`signingKid`** must point to an entry in **`publicKeys.ed25519[]`** with the same `kid`, and the signature must validate against the UTF-8 message:

  `stableStringify({ schema, handle, updatedAt, agentCardUrl })`

  (same canonicalization as the Hive bus — `services/registry/src/stable-stringify.mjs`).

On failure: **`GET /v1/records/{handle}`** responds **409** `{ "error": "proof_verification_failed", "reason": "…" }`.

## Optional persistence

With **`REGISTRY_DATABASE_URL`**, the stub hydrates and persists records in PostgreSQL (`hive_registry_records`). See the service README.

## Tests

- Ajv: [`app/src/lib/hive-registry-record-schema.test.ts`](../app/src/lib/hive-registry-record-schema.test.ts).
- Crypto: `npm test` in `services/registry` ([`registry-proof.test.mjs`](../services/registry/src/registry-proof.test.mjs)).

## Possible next steps

- DID / VC (W3C), registry JWT, policy-based PDP.
- Revocation (CRL, TTL, revocation registry).
