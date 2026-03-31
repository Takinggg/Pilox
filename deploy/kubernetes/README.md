# Kubernetes examples

Manifests here are **examples** (copy/edit before production). Helm charts live under [`deploy/helm/`](../helm/README.md). CI runs `python3 scripts/validate-k8s-example-yaml.py deploy/kubernetes` (all `*.example.yaml` in that directory; syntax only, not full schema).

| File | Purpose |
|------|---------|
| [`p3-bridge-nats-smoke-job.example.yaml`](./p3-bridge-nats-smoke-job.example.yaml) | **Job** — smoke with **JetStream** (stream must exist) |
| [`p3-bridge-nats-smoke-job-core.example.yaml`](./p3-bridge-nats-smoke-job-core.example.yaml) | **Job** — smoke with NATS **core** only (no stream) |
| [`p3-bridge-nats-smoke-cronjob.example.yaml`](./p3-bridge-nats-smoke-cronjob.example.yaml) | **CronJob** — JetStream smoke on a schedule; expects Secret `p3-bridge-nats-smoke` |
| [`p3-bridge-nats-smoke-cronjob-core.example.yaml`](./p3-bridge-nats-smoke-cronjob-core.example.yaml) | **CronJob** — NATS **core** smoke; expects Secret `p3-bridge-nats-smoke-core` |
