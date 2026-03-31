<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Hive — scope

Even outside the strict scope of the ticket, **small fixes deemed useful** are welcome (e.g. blocking TypeScript error, nearby failing test, one-line doc fix). Avoid large unsolicited refactors.

**Onboarding:** the canonical first-run guide is **`docs/GETTING_STARTED.md`** (repo root). If you change default ports, compose services, migrate/seed commands, or required env vars, update that file and the **Quick reference** in the root **`README.md`**.

Mesh WAN / planetary: after a contract or discovery change, update **`docs/MESH_PLANETARY_TRACE.md`** (and **`app/src/lib/mesh-version.ts`** if the `meshV2` contract changes). After editing schemas / OpenAPI under **`docs/schemas`** or **`docs/openapi`**: **`npm run docs:validate-planetary`**. P3 envelope **`wan-envelope-v1`**: Ajv tests in **`src/lib/wan-envelope-schema.test.ts`**. Node stubs (registry, gateway, transport-bridge) under **`../services/`**: **`npm run check`** in the modified directory; CI runs **`npm ci && npm run check && npm test`** in **`services/registry`** and **`npm ci && npm run check`** in **`services/transport-bridge`** and **`services/gateway`**. Planetary versioning: **`PLANETARY_MESH_REFERENCE_VERSION`** + **`docs/MESH_PLANETARY_CHANGELOG.md`**; adoption checklist **`docs/MESH_PLANETARY_V1_ADOPTION.md`**. Optional HTTP smoke test: from **`app/`**, **`npm run smoke:planetary`** (stubs already started). Docker images: **`docker compose --profile planetary-dht build`** (CI job **planetary-docker**; default planetary stubs no longer use a `planetary` profile). WAN ingress: **`POST /api/mesh/wan/ingress`** (operator / **`HIVE_INTERNAL_TOKEN`**) → Redis bus **`mesh.wan.envelope`**; demo worker **`npm run mesh:wan-worker`**. Milestones P4–P6 (registry sync, `proof`, bridge→ingress traces): **`docs/MESH_PLANETARY_P4_FEDERATED_SYNC.md`**, **`P5_TRUST_PROOF.md`**, **`P6_WAN_TRACE.md`**, **`docs/MESH_PLANETARY_TRACE.md`** — see **`docs/MESH_PLANETARY_PRODUCT.md`**.

**Logging conventions:** Node scripts under **`app/scripts/`** and CI helpers should prefix human-readable stderr/stdout with **`[hive]`** (see **`scripts/cli-prefix.mjs`**). The standalone **`Hive market-place/`** service uses **`[hive:registry]`** and **`[hive:marketplace]`**. The mesh WAN worker’s **`log`** mode keeps **raw JSON lines** on stdout for log shippers; other modes use structured logging.

**Dataset extractors:** **`extract-langflow-components.mjs`** uses **`LANGFLOW_CLONE_DIR`** or **`--clone-dir`** (default: **`<repo>/langflow-clone`**). **`extract-mastra-nodes.mjs`** uses **`MASTRA_CLONE_DIR`** or the OS temp directory + **`mastra-clone`**. Outputs always land under **`app/src/lib/*.json`** relative to the app package.

**DB CLI (`migrate.ts`, `seed.ts`, `marketplace-index-bootstrap.ts`):** log lines are prefixed **`[hive]`** (or **`[hive] marketplace-index:`** for the index job) for grep in CI and Docker logs.

**E2E MFA:** Playwright tests that need TOTP expect a prepared user; from **`app/`** run **`npm run e2e:prepare-mfa`** with **`E2E_MFA_SECRET`** (base32), **`DATABASE_URL`**, **`ENCRYPTION_KEY`**. See **`README.md`**, **`playwright.config.ts`**, and **`docs/GETTING_STARTED.md`** § 11.1 (local **`npm run dev`** before **`npm run test:e2e`**). Smoke: **`e2e/dashboard-smoke.spec.ts`** (main routes), **`e2e/api-public.spec.ts`** (**`/api/health`**, **`/api/setup/status`** without auth).
