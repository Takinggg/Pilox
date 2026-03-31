# Dependency security (Hive)

## CI

- **`app/`** — `npm audit --audit-level=high` runs in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) as **informational** (`continue-on-error: true`) so merges are not blocked by transitive noise, while high/critical issues remain visible in logs.
- Review audit output on each PR touching `package-lock.json`.

## Overrides

- **`app/package.json`** may use `overrides` (e.g. pinned `caniuse-lite`) for reproducible builds. Document any security-motivated override in the PR that adds it.
- Tooling chains (e.g. `drizzle-kit` → `esbuild`) can surface dev-only advisories; treat **runtime** exposure separately from **devDependencies**.

## Renovation

- [**Dependabot**](../.github/dependabot.yml) opens weekly PRs for `app/` and `app/Hive market-place/`.
- Optionally run a **quarterly** manual `npm audit fix` (or minor bumps) on `main` after reading changelogs.

## Hive market-place (Node)

- Lint: `npm run lint` in `app/Hive market-place/` (ESLint on `src/**/*.mjs`).
- Keep `npm run check` + `npm test` green in CI.
