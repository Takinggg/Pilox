# Pilox

The agent operating system for your infrastructure.

Deploy, connect, and manage AI agents across your infrastructure — with built-in isolation, mesh networking, and operator tooling.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Takinggg/Pilox.git && cd Pilox

# 2. Start (auto-detects GPU, generates secrets, builds everything)
bash scripts/start.sh

# 3. Open http://localhost:3000/setup
```

The start script automatically:
- Generates secure random secrets if no `.env` exists
- Detects NVIDIA GPUs and enables vLLM for HuggingFace models
- Starts PostgreSQL, Redis, Ollama, and the full Pilox stack

## Architecture

```
Pilox/
  app/              # Next.js 15 application (main product)
  docker/           # Docker Compose files (local, prod, HA)
  services/         # Planetary mesh microservices
    registry/       # Agent registry
    gateway/        # A2A JSON-RPC gateway
    transport-bridge/ # NATS WAN transport
  packages/         # Shared packages
    a2a-sdk/        # A2A protocol SDK
  deploy/           # Kubernetes Helm charts
  docs/             # Documentation
```

## Features

- **Agent Management** — Create, deploy, monitor AI agents with visual workflows
- **800+ Models** — Ollama, OpenAI, Groq, Mistral, Anthropic
- **A2A + MCP** — Linux Foundation standard protocols
- **Federated Mesh** — Connect instances across WAN with JWT auth
- **Marketplace** — Browse, publish, deploy agents from registries
- **Observability** — Prometheus metrics + Tempo traces
- **Security** — AES-256-GCM encryption, RBAC, audit logs
- **Self-hosted** — Your VPC, your data, no vendor lock-in
- **TurboQuant** — Google's 3-bit KV cache compression: run 70B models on consumer GPUs

## Environment

Copy `docker/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | Session signing key (32+ chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 key (64 hex chars) |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |

Full config reference: `app/src/lib/env.ts`

## License

BSL 1.1 — Converts to Apache 2.0 in March 2030.
