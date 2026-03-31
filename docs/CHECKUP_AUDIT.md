# Checkup / Full Audit — Hive (`app/` + docs)

**Reproducible** report (commands executed on the dev environment). *March 2026.*

---

## 1. Executive Summary

| Pillar | Status | Comment |
|--------|--------|---------|
| **TypeScript** | OK | `npx tsc --noEmit` — 0 errors. |
| **Unit tests** | OK | `npm run test` (Vitest) — **129** tests, **26** files. |
| **ESLint** | **OK** | **0 errors**, **0 warnings** after hygiene pass (March 2026). |
| **npm audit** | Acceptable with caveats | **4** **moderate** vulnerabilities, **esbuild** chain via **drizzle-kit** (dev tooling / migrations) — not the Next runtime app in prod. |
| **Application security** | Good foundation | RBAC, rate limits, mesh Zod + optional HMAC — see [`PETIT_GROS_AUDIT.md`](./PETIT_GROS_AUDIT.md), [`THREAT_MODEL.md`](./THREAT_MODEL.md). |
| **Mesh v1 (DoD)** | **100 %** (local scope) | Checklist **23 / 23** in [`MESH_V1_DONE.md`](./MESH_V1_DONE.md); planetary mesh = [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md). |

**Verdict**: the product is **technically sound for shipping** in terms of types, tests, and **clean lint**; the **dev supply chain** (esbuild via drizzle-kit) remains to be monitored.

---

## 2. ESLint Detail

### Errors

- **None** after fixes: `timeAgo` on Settings uses a clock tick in state; dashboard agent/model/detail loading documented with `void …()` + targeted `eslint-disable-next-line` where the `react-hooks/set-state-in-effect` rule is too strict for async fetch at mount.

### Warnings

- **None** on the latest pass (see `npm run lint`).

**Medium term**: migrate dashboard lists to a pattern recommended by React 19 (Suspense / server data) if you want to reduce the targeted `eslint-disable-next-line` on async effects.

---

## 3. npm audit

- **GHSA-67mh-4wv8-2f99** (esbuild ≤ 0.24.2): **dev server** esbuild attack surface; transitive dependency of **drizzle-kit**.
- `npm audit fix --force` proposes a **breaking upgrade** of drizzle-kit — evaluate in a dedicated PR (migration tests, CI).

**Action**: track **drizzle-kit** releases / replace the `@esbuild-kit/*` chain when upstream fixes it; do not apply `--force` without a plan.

---

## 4. Scope already audited elsewhere

| Document | Content |
|----------|---------|
| [`PETIT_GROS_AUDIT.md`](./PETIT_GROS_AUDIT.md) | Public APIs, Redis, CORS, A2A. |
| [`A2A_OPS_AUDIT.md`](./A2A_OPS_AUDIT.md) | A2A scalability / multi-worker. |
| [`MESH_V1_DONE.md`](./MESH_V1_DONE.md) | Mesh definition of done. |
| [`PRODUCTION.md`](./PRODUCTION.md) | Hardening, env, RBAC, mesh HMAC. |

---

## 5. Resumption Checklist (suggested order)

1. ~~**Clean up ESLint warnings**~~ — done (March 2026 pass).
2. **drizzle-kit / esbuild plan** — dependency watch or planned upgrade.
3. **Mesh**: decide on §1 `MESH_V1_DONE` (Streams / NATS) when load demands it.
4. **Design** §7: align with Pencil or document the intentional gap.

---

## 6. Reproduction Commands

```bash
cd app
npx tsc --noEmit
npm run test
npm run lint
npm audit
```

---

*Next checkup revision: after reducing ESLint warnings or a major dependency upgrade.*
