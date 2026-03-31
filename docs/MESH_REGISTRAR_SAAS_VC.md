# Registrar SaaS (multi-tenant) + VC-JWT gate

## Multi-tenant mode

Enable with **`REGISTRY_MULTI_TENANT=1`**.

- **Tenant id** is sent on every **GET** catalog, **GET** by handle, **POST**, **DELETE**, and **GET** `/v1/resolve` via header **`REGISTRY_TENANT_HEADER`** (default **`X-Hive-Registry-Tenant`**).
- Format: `[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}` (max 64 chars).
- **Storage** uses an internal composite key (`tenant` + separator + logical `handle`). URLs still use the **logical** handle only; isolation is per tenant.
- **Seed** (`REGISTRY_SEED_RECORD`): set **`REGISTRY_SEED_TENANT=<id>`** when multi-tenant is on.
- **P4 sync** with multi-tenant: set **`REGISTRY_SYNC_LOCAL_TENANT`** — merged records are stored under that tenant namespace. If the **peer** is also multi-tenant, set **`REGISTRY_SYNC_PEER_TENANT`** so outbound catalog/record requests include the tenant header.

## VC-JWT verification (not a full VC engine)

Hive’s registry can require a **W3C VC as JWT** style token on **POST** (`REGISTRY_VC_REQUIRED=1` + **`REGISTRY_VC_JWKS_URL`**).

- **Verified**: JWT signature against **JWKS**, **`exp`/`iat`** (with small clock tolerance), presence of a **`vc`** claim, optional **`iss`** allowlist (`REGISTRY_VC_ISSUER_ALLOWLIST`), optional match **`sub`** ↔ record **`controllerDid`** (`REGISTRY_VC_REQUIRE_CONTROLLER_MATCH`, default on).
- **JWT location**: HTTP header **`X-Hive-Vc-Jwt`** (override with **`REGISTRY_VC_JWT_HEADER`**).
- **Not implemented in code**: JSON-LD canonicalization, SD-JWT, status list / CRL polling, full presentation exchange, OID4VCI issuance flows, ZKP proofs — integrate those via a **dedicated issuer/verifier service** or extend this module.

For a **complete enterprise VC program**, plan a separate “verification service” and keep the registry as a policy enforcement point (this JWT gate is a **narrow** building block).

## See also

- [`services/registry/README.md`](../services/registry/README.md) — full env table
- [`docs/openapi/registry-v1.yaml`](./openapi/registry-v1.yaml)
