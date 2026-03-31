# Mesh — inter-instance mTLS (V4)

## Role relative to the federated JWT

- **JWT** (`X-Hive-Federation-JWT`, HS256 / Ed25519): **application-level** authentication — who is talking to the JSON-RPC, audience, expiration, `jti`, etc.
- **mTLS**: **transport-level** authentication — an actor without a valid client certificate cannot establish mutual TLS to the endpoint, even if they know a URL path.

These are two **complementary** layers (defense in depth). mTLS **does not replace** JWT verification on the Hive side.

## V4 horizon

Typical prerequisites:

- Dedicated **PKI** (internal CA, short rotation)
- **SPIFFE / SPIRE** (already mentioned in [TECH_VISION.md](./TECH_VISION.md) for workload identity)
- Automatic certificate **issuance and renewal** process on each node

The effort is **significant** because it affects infrastructure, not just an environment variable in the app.

## Where to terminate mTLS

Two common patterns:

1. **Gateway → Hive**: the WAN gateway ([MESH_GATEWAY_WAN.md](./MESH_GATEWAY_WAN.md)) requires a client certificate issued by your CA; Hive behind the gateway remains on HTTP over the private network **or** server-only simple TLS.
2. **Peer → Peer**: each Hive instance exposes TLS with **client auth**; peers present a SPIFFE certificate `spiffe://trust/domain/workload/hive`.

Hive **does not currently implement** client certificate verification in the Node (Next) runtime: the operator configures **Envoy, Caddy, nginx** or a **service mesh** (Istio, Linkerd) for the mTLS handshake and optionally passes identities via internal headers — **without** replacing the application-controlled federation JWT headers.

## Operator checklist

- [ ] **Client IP trust**: Hive derives the IP for federation allowlists and public JSON-RPC limits from **`HIVE_CLIENT_IP_SOURCE`** and proxy headers — put TLS/mTLS on a **trusted** edge that sets **`X-Real-IP`** or a correct **`X-Forwarded-For`** chain (see [`PRODUCTION.md`](./PRODUCTION.md) §4.1).
- [ ] Root CA + intermediates, revocation procedure (CRL or OCSP)
- [ ] Short-lived certificates (e.g., 24 h) + automatic renewal (SPIRE, cert-manager, etc.)
- [ ] SNI / SAN mapping to Hive backends
- [ ] Trust policy: who receives a "federated peer" certificate
- [ ] Regression tests: invalid JWT is still rejected **even** with mTLS OK

## See also

- [MESH_FEDERATION_RUNBOOK.md](./MESH_FEDERATION_RUNBOOK.md) — JWT revocation, IP allowlist
- [THREAT_MODEL.md](./THREAT_MODEL.md) — network trust assumptions
