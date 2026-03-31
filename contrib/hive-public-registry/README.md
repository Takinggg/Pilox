# Hive public registry (mirror)

Machine-readable **mirror** of [Hive](https://github.com/Takinggg/Hive) registry handles.  
**Repo:** [github.com/Takinggg/hive-public-registry](https://github.com/Takinggg/hive-public-registry)  
Records are produced by the **Hive Registry Hub** (export job — see [HIVE_GLOBAL_REGISTRY_GIT_PLAN.md](https://github.com/Takinggg/Hive/blob/main/docs/HIVE_GLOBAL_REGISTRY_GIT_PLAN.md) in the main repo).

The same tree lives under **`contrib/hive-public-registry/`** in the Hive monorepo; push updates here from that folder or via a future export job.

## Layout

- `records/` — one JSON file per handle (e.g. `records/acme01/my-bot.json`), each conforming to **hive-registry-record-v1**.

## Validation

```bash
npm ci
npm run validate
```

The repo ships **copies** of the canonical JSON Schemas under `schemas/` (from the Hive monorepo).  
If those files are missing (fork without vendored schemas), `npm run validate` falls back to fetching from `SCHEMA_BASE_URL` (default: Hive `main` on GitHub).

## Updating from a Hub

On the machine that runs the registry (with `REGISTRY_DATABASE_URL`):

```bash
cd /path/to/Hive/services/registry
npm run export-records -- /path/to/hive-public-registry/records
cd /path/to/hive-public-registry
npm run validate && git add records && git commit -m "chore: sync registry export" && git push
```

## Contributing

**Do not** hand-edit this mirror for production claims. Handles are admitted via the **Registry Hub** API (`REGISTRY_INSTANCE_AUTH` + instance token).  
PRs here are for **export tooling**, **documentation**, or **emergency operator** corrections only.

## Trust

Prefer verifying records against a running registry `GET /v1/records/{handle}` or a signed **catalogProof** from the Hub. This Git tree is a transparency layer, not the sole source of truth for real-time uniqueness.
