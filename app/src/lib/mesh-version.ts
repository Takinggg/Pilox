/**
 * WAN mesh contract string exposed on federation status, directory, pilox-mesh descriptor,
 * and `GET /api/a2a/status` — bump when changing cross-instance-visible mesh behavior.
 */
export const MESH_V2_CONTRACT_VERSION = "2.10.0" as const;

/**
 * Semver for the **planetary stub reference** (OpenAPI/schemas under `docs/` + `services/registry|gateway|transport-bridge`).
 * Bump **major** for breaking wire/schema for adopters; **minor** for additive contracts; **patch** for fixes/docs only.
 * Distinct from `MESH_V2_CONTRACT_VERSION` (Pilox instance ↔ peers).
 */
export const PLANETARY_MESH_REFERENCE_VERSION = "1.3.1" as const;
