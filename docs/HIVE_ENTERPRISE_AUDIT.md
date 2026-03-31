# Hive — Audit Complet Enterprise Grade

**Date** : 27 Mars 2026  
**Portée** : `app/` + documentation + infrastructure  
**Verdict global** : **7.7/10** — Enterprise-ready with gaps critiques à corriger

---

## Table des matières

1. [Synthèse Exécutive](#1-synthèse-exécutive)
2. [Qualités & Points Forts](#2-qualités--points-forts)
3. [Défauts & Vulnérabilités](#3-défauts--vulnérabilités)
4. [Axes d'Amélioration](#4-axes-damélioration)
5. [Recommandations Techniques](#5-recommandations-techniques)
6. [Roadmap de Correction](#6-roadmap-de-correction)

---

## 1. Synthèse Exécutive

### Scores par Dimension

| Dimension | Score | /10 | Statut |
|-----------|-------|-----|--------|
| Architecture & Design | 8.5 | ✅ | Excellent |
| Sécurité | 8.5 | ✅ | MFA TOTP + gate Redis ; à durcir : sandbox code |
| Qualité Code | 7.5 | ⚠️ | Silent catch résiduels côté UI |
| Tests & Couverture | 7 | ⚠️ | E2E élargis ; couvrir MFA en CI |
| Performance | 7.5 | ✅ | Bien optimisé |
| Observabilité | 9 | ✅✅ | Exemplaire |
| Déploiement & Infra | 8 | ✅ | Helm `hive-app` + compose HA |
| Documentation | 8.5 | ✅✅ | Exceptionnelle |
| **GLOBAL** | **8.2** | **—** | **Enterprise-ready — suivre plan résiduel** |

### Statut des Audits Existants

| Document | Couverture |
|----------|------------|
| `CHECKUP_AUDIT.md` | ✅ TypeScript, ESLint, npm audit — OK |
| `PETIT_GROS_AUDIT.md` | ✅ APIs, Redis, CORS, A2A — Sound |
| `THREAT_MODEL.md` | ✅ Security model — Complet |
| `A2A_OPS_AUDIT.md` | ✅ A2A scalability — Bon équilibre |
| `MESH_V1_DONE.md` | ✅ Mesh local 23/23 — 100% |
| `ROADMAP_2026_EXEC_SUMMARY.md` | ✅ Direction produit — Clair |

### Verdict

> Hive reste **bien positionné pour la production** : MFA TOTP avec preuve côté serveur (Redis + JWT), verrouillage distribué sur le cycle de vie agent, Helm et compose HA. **Priorité résiduelle** : réduire les exécutions `new Function` dans les workflows (isolation renforcée) et poursuivre la réduction des erreurs silencieuses.

---

## 2. Qualités & Points Forts

### 2.1 Architecture & Design

#### Stack Technologique
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Framework | Next.js | 15 (App Router) |
| Language | TypeScript | Strict mode |
| Database | PostgreSQL | via Drizzle ORM |
| Cache | Redis | ioredis |
| Auth | NextAuth | v5 (JWT) |
| Styling | Tailwind CSS | v4 + shadcn/ui |
| Validation | Zod | v4 |
| Testing | Vitest + Playwright | — |

#### Structure du Monorepo
```
Hive/
├── app/                    # Next.js (dashboard + API)
├── packages/
│   └── a2a-sdk/          # A2A Protocol SDK
├── services/
│   ├── gateway/           # WAN mesh gateway
│   ├── registry/          # Agent registry
│   └── transport-bridge/   # NATS bridge
├── deploy/
│   └── helm/             # Kubernetes Helm charts
├── docker/                # Production Docker Compose
└── docs/                 # Documentation technique
```

**Points forts** :
- Séparation claire des préoccupations
- Modules découplés avec interfaces Typed
- A2A Protocol first-class citizen
- Mesh architecture modulaire (v1 local → v2 planétaire)

#### Patrons de Design
- **Repository pattern** via Drizzle ORM
- **Middleware pattern** pour auth, rate-limiting, security headers
- **Pub/Sub** pour mesh events via Redis
- **Strategy pattern** pour hypervisors (Firecracker, Cloud Hypervisor, Docker)

### 2.2 Sécurité (ROBUSTE)

#### Matrice de Sécurité

| Mécanisme | Implémentation | Status |
|-----------|----------------|--------|
| **Session auth** | JWT NextAuth v5 | ✅ |
| **API tokens** | Bearer SHA-256 hashed + HMAC | ✅ |
| **Service tokens** | `HIVE_INTERNAL_TOKEN` | ✅ |
| **Federation JWT** | HS256/Ed25519 + JTI anti-replay | ✅ |
| **Password hashing** | bcrypt cost 12 | ✅ |
| **Secrets encryption** | AES-256-GCM avec IV 12 bytes | ✅ |
| **Rate limiting** | Redis sliding window (6 presets) | ✅ |
| **RBAC** | admin > operator > viewer | ✅ |
| **MFA (TOTP)** | Routes `/api/auth/mfa/*`, gate Redis, UI Settings | ✅ |
| **Security headers** | CSP nonce, HSTS, X-Frame, etc. | ✅✅ |
| **SSRF protection** | `egress-ssrf-guard.ts` complet | ✅ |
| **CSRF protection** | Origin/Referer verification | ✅ |
| **Mesh HMAC** | `MESH_BUS_HMAC_SECRET` events | ✅ |
| **Audit logging** | PostgreSQL audit_logs | ⚠️ Silent fails |

#### Security Headers (`middleware.ts`)
```typescript
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: nonce-based + strict-dynamic
```

#### Rate Limiting Presets

| Preset | Window | Max Requests | Fail-Open |
|--------|--------|--------------|-----------|
| `login` | 15 min | 5 | ❌ |
| `register` | 60 min | 3 | ❌ |
| `api` | 60 sec | 120 | ✅ |
| `secrets` | 60 sec | 30 | ❌ |
| `backup` | 60 min | 5 | ❌ |
| `health` | 60 sec | 60 | ✅ |

### 2.3 Qualité de Code

#### Résultats des Vérifications
```bash
✅ npx tsc --noEmit        # 0 erreurs
✅ npm run lint             # 0 erreurs, 0 warnings
✅ npm run test             # 129 tests, 26 fichiers
```

#### Bonnes Pratiques Observées

| Pratique | Fichier | Implémentation |
|----------|---------|----------------|
| Zod validation | `app/src/app/api/**/route.ts` | Toutes les entrées validées |
| Parametric queries | Drizzle ORM | Anti SQL injection |
| TypeScript strict | `tsconfig.json` | Mode strict activé |
| Named exports | `lib/` | Cohérent |
| Error codes standardisés | `lib/errors.ts` | Codes structurés |
| Timing-safe comparison | `authorize.ts` | `timingSafeEqual()` |
| Redis connection pooling | `lib/redis.ts` | Lazy connect |

#### Environment Validation (`env.ts`)
```typescript
ENCRYPTION_KEY: z.string().length(64, "...").regex(/^[0-9a-fA-F]+$/),
AUTH_SECRET: z.string().min(32, "..."),
DATABASE_URL: z.string().min(1, "..."),
```
**900+ lignes de validation** avec messages d'erreur explicites.

### 2.4 Observabilité (EXEMPLAIRE)

#### Stack Implémentée
| Outil | Usage |
|-------|-------|
| **OpenTelemetry** | Tracing distribué |
| **Prometheus** | Métriques |
| **Hive `/observability`** | Graphiques Prometheus + traces Tempo (UI native) |
| **Tempo** | Distributed tracing |

#### Logs Événementiels
```
mesh.a2a.rpc.request           # A2A JSON-RPC calls
mesh.a2a.rpc.complete          # A2A outcomes
mesh.redis.publish_failed       # Mesh bus failures
auth.token_failed               # Failed auth attempts
mesh.federation.inbound_jsonrpc # Federation calls
```

#### Fichiers d'Observabilité
- `app/src/lib/observability-tempo.ts`
- `app/src/lib/observability-prometheus.ts`
- `app/src/lib/mesh-otel.ts`
- `docs/observability/README.md`
- `docs/observability/ALERTING.md`
- `docs/observability/MULTI_REGION_SLO_RUNBOOK.md`

### 2.5 Documentation (EXCEPTIONNELLE)

#### Structure Documentaire
| Catégorie | Fichiers |
|-----------|----------|
| Architecture | README.md, TECH_VISION.md, MESH_V2_GLOBAL.md |
| Sécurité | THREAT_MODEL.md, PETIT_GROS_AUDIT.md |
| Ops | RUNBOOK.md, MESH_FEDERATION_RUNBOOK.md, OBSERVABILITY.md |
| Mesh | MESH_V1_DONE.md, MESH_PLANETARY_*.md (P1-P6) |
| API | OpenAPI specs in `docs/openapi/` |
| ADR | Architecture Decision Records in `docs/ADR/` |
| Roadmap | ROADMAP_2026_EXEC_SUMMARY.md, ROADMAP_2026_ENGINEERING_CHECKLIST.md |

#### Contenu Notable
- **Threat Model** détaillé avec surfaces d'attaque
- **Mesh Federation Runbook** avec JWT configs
- **Multi-region SLO Runbook** pour HA
- **Engineering Checklist 2026** exhaustive
- **ADR pour billing Stripe** avec credits internes

---

## 3. Défauts & Vulnérabilités

### 3.1 CRITIQUE

#### C1: Code Execution Sandbox (`workflow-executor.ts:810`)

**Localisation** : `app/src/lib/workflow-executor.ts:810`

**Problème** :
```typescript
// new Function() pour les code nodes - RISQUE ÉLEVÉ
const fn = new Function('variables', 'console', code);
const result = fn(variables, sandboxConsole);
```

**Impact** : 
- `new Function()` bypass les sécurités même avec globals shadowed
- Un agent malveillant pourrait exécuter du code sur l'host
- Potentielle élévation de privilèges

**Sévérité** : CVSS 7.5 (High)

**Recommandation** :
```typescript
// Remplacer par VM2 ou isolated-vm
import { VM } from 'vm2';
const vm = new VM({
  timeout: 5000,
  sandbox: { variables, console }
});
const result = vm.run(code);
```

---

#### C2: Command Injection Potential (`cloud-hypervisor.ts`)

**Localisation** : `app/src/lib/cloud-hypervisor.ts`

**Problème** :
```typescript
// spawn() avec paramètres potentiellement influençables
spawn(channel, args, { stdio: 'pipe' });
```

**Impact** : Si `channel` ou `args` derivés de l'input utilisateur sans sanitization stricte, risque d'injection de commandes.

**Sévérité** : CVSS 8.0 (High)

**Recommandation** :
- Valider exhaustivement tous les paramètres avant `spawn()`
- Utiliser des allowlists pour les valeurs autorisées
- Exécuter dans un container isolé

---

### 3.2 HIGH

#### H1: Error Swallowing (254 instances)

**Localisation** : Multiples fichiers

**Problème** :
```typescript
// authorize.ts:171-176
db.insert(auditLogs).values({
  action: "auth.token_failed",
  resource: "api_token",
  details: { reason: "invalid_token" },
  ipAddress: ip,
}).catch(() => {});  // Silent failure
```

**Statistiques** :
- 254 instances de `.catch(() => {})`
- Fichiers concernés : `authorize.ts`, `cloud-hypervisor.ts`, `firecracker.ts`, etc.

**Impact** :
- Audit logs perdus → forensics compromis
- Debugging difficile
- Conformité SOC2/GDPR à risque

**Recommandation** :
```typescript
// Remplacer par :
.catch((err) => log.error('Audit log failed', { error: err, ... }));
```

---

#### H2: Multi-Factor Authentication Manquante

**Localisation** : `app/src/lib/auth.ts`

**Problème** : Pas de MFA implémenté. Un password compromis = accès total.

**Impact** :
- Critique pour enterprise
- Non conforme aux exigences SOC2/ISO27001
- Vulnérable aux attaques de credential stuffing

**Recommandation** :
```typescript
// Implémenter TOTP
import { authenticator } from 'otplib';

const verifyTOTP = (secret: string, token: string) => {
  return authenticator.verify({ token, secret });
};
```

---

#### H3: Race Condition (`session-security.ts`)

**Localisation** : `app/src/lib/session-security.ts:61`

**Problème** :
```typescript
// incrementSecurityVersion - pas de locking
await redis.incr(`hive:security_version:${userId}`);
```

**Impact** : Mises à jour concurrentes peuvent perdre des increments.

**Recommandation** :
```typescript
// Lua script atomique
const LuaScript = `
  local current = redis.call('GET', KEYS[1])
  local next = (current or 0) + 1
  redis.call('SET', KEYS[1], next)
  return next
`;
```

---

#### H4: Pas de Distributed Locking pour Agents

**Localisation** : Agent lifecycle management

**Problème** : Pas de locking distribué pour la création d'agents. Risque de duplication.

**Recommandation** : Implémenter Redis distributed locks avec Redlock.

---

### 3.3 MEDIUM

#### M1: Tests E2E Insuffisants

**Localisation** : `app/e2e/`

**Statut actuel** :
- 2 fichiers E2E : `billing.spec.ts`, `marketplace.spec.ts`
- 129 tests unitaires dans 26 fichiers

**Manquants critiques** :
| Scenario | Status |
|----------|--------|
| Agent creation/deletion | ❌ |
| Authentication flows | ❌ |
| Workflow execution | ❌ |
| Federation setup | ❌ |
| Rate limiting | ❌ |
| Health checks | ❌ |

**Recommandation** : 20+ scenarios Playwright minimum pour coverage critique.

---

#### M2: Pas de HA Architecture

**Localisation** : `docker/docker-compose.prod.yml`

**Problèmes** :
- Single replica pour toutes les services
- Pas de PostgreSQL replication
- Pas de Redis Sentinel/Cluster
- Pas de load balancer failover

**Recommandation** :
```yaml
# docker-compose.prod.yml
services:
  postgres_primary:
    replicas: 1
  postgres_replica:
    replicas: 2
  redis:
    command: redis-sentinel --sentinel
  hive_app:
    replicas: 3
```

---

#### M3: Backup Automation Manquante

**Localisation** : `app/src/app/api/backups/`

**Problèmes** :
- Pas de cron/schedule dans docker-compose
- Pas de backup automatique PostgreSQL
- Pas de rotation des backups
- Restore disponible mais pas de backup planifié

**Recommandation** :
```yaml
# Ajouter au docker-compose
backup:
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention: 30  # days
```

---

#### M4: Kubernetes Helm Chart Manquant pour App Core

**Localisation** : `deploy/helm/`

**Statut** :
- ✅ `hive-mesh-gateway`
- ✅ `hive-transport-bridge`
- ✅ `hive-registry`
- ✅ `hive-planetary` (umbrella)
- ❌ `hive-app` (core)

**Recommandation** : Créer chart Helm pour l'application principale.

---

#### M5: Token Expiry Non Vérifié Mid-Request

**Localisation** : API routes

**Problème** : Si le token expire pendant une requête longue, pas de re-validation.

---

#### M6: Pas de Pagination sur Audit Logs

**Localisation** : `app/src/app/api/audit-logs/`

**Problème** : Audit logs pourraient croître indéfiniment sans pagination.

---

### 3.4 LOW

#### L1: Large Files

| Fichier | Lignes | Recommandation |
|---------|--------|----------------|
| `app/src/db/schema.ts` | 400+ | Splitter par domaine |
| `app/src/lib/workflow-executor.ts` | 996 | Extraire les nodes handlers |
| `app/src/lib/env.ts` | 903 | Garder, bien organisé |
| 80+ API routes | — | Grouper par domaine |

---

#### L2: Code Duplication

| Pattern | Fichiers |
|---------|----------|
| JWT signing/verification | `mesh-federation-jwt.ts` vs `a2a/key-material.ts` |
| Rate limiting | `rate-limit.ts` vs A2A middleware |
| Response formatting | `login/route.ts` vs `register/route.ts` |

---

#### L3: Memory Leaks Potential

**Localisation** : `app/src/lib/redis.ts:95`

```typescript
// Connection pas fermée explicitement sur shutdown
await redis.quit();  // Manquant
```

---

#### L4: npmaudit Vulnerabilities

**Localisation** : `package.json`

```
4 moderate vulnerabilities via esbuild chain (drizzle-kit dev tooling)
```

**Note** : Impact limité au dev server, pas au runtime prod.

---

## 4. Axes d'Amélioration

### 4.1 Phase 1 : Sécurité Critique (Avant Prod)

| # | Action | Fichier | Priorité | Effort |
|---|--------|---------|----------|--------|
| 1 | Implémenter MFA (TOTP) | `auth.ts`, `authorize.ts` | 🔴 P0 | 3-5 jours |
| 2 | Remplacer `new Function()` par sandbox | `workflow-executor.ts` | 🔴 P0 | 2-3 jours |
| 3 | Logging pour 254 `.catch(()=>{})` | Multiples | 🟠 P1 | 1-2 jours |
| 4 | Validation exhaustive spawn() | `cloud-hypervisor.ts` | 🟠 P1 | 1-2 jours |
| 5 | Distributed locking agents | Agent lifecycle | 🟠 P1 | 2-3 jours |

### 4.2 Phase 2 : Fiabilité Enterprise

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 6 | Tests E2E complets (20+ scenarios) | 🟠 P1 | 1-2 semaines |
| 7 | PostgreSQL avec streaming replication | 🟠 P1 | 2-3 jours |
| 8 | Redis Sentinel pour failover | 🟠 P1 | 2-3 jours |
| 9 | Backup automatique avec schedule | 🟡 P2 | 1-2 jours |
| 10 | Race condition fix (security version) | 🟡 P2 | 1 jour |

### 4.3 Phase 3 : Scalabilité

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 11 | Helm chart pour Hive app core | 🟡 P2 | 3-5 jours |
| 12 | Multiple replicas + load balancer | 🟡 P2 | 2-3 jours |
| 13 | Circuit breaker distribué | 🟡 P2 | 2-3 jours |
| 14 | Pagination audit logs | 🟢 P3 | 1 jour |

### 4.4 Phase 4 : Observabilité Avancée

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 15 | SLO/SLA definitions + alerting | 🟡 P2 | 2-3 jours |
| 16 | Distributed tracing e2e | 🟢 P3 | 2-3 jours |
| 17 | Performance benchmarks CI | 🟢 P3 | 1-2 jours |

### 4.5 Phase 5 : DX & Maintenance

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 18 | Split large files | 🟢 P3 | 2-3 jours |
| 19 | API documentation (Swagger UI) | 🟢 P3 | 2-3 jours |
| 20 | Feature flags system | 🟢 P3 | 3-5 jours |

---

## 5. Recommandations Techniques

### 5.1 Security Hardening

#### Ajouter au schema env
```typescript
// app/src/lib/env.ts
MFA_TOTP_ISSUER: z.string().default("Hive"),
MFA_ENABLED: z.enum(["true", "false"]).default("false"),
SESSION_TIMEOUT_MINUTES: z.coerce.number().default(30),
MAX_LOGIN_ATTEMPTS: z.coerce.number().default(3),
```

#### MFA Implementation
```typescript
// app/src/lib/mfa.ts
import { authenticator } from 'otplib';

export async function generateMFASecret(userId: string): Promise<string> {
  const secret = authenticator.generateSecret();
  await db.update(users)
    .set({ mfaSecret: encrypt(secret) })
    .where(eq(users.id, userId));
  return secret;
}

export function verifyMFAToken(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}
```

### 5.2 Code Sandbox

```typescript
// app/src/lib/workflow-sandbox.ts
import { VM } from 'vm2';

interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
}

export function createSandbox(options: SandboxOptions = {}) {
  return new VM({
    timeout: options.timeout ?? 5000,
    memoryLimit: options.memoryLimit ?? 128,
    sandbox: {
      variables: {},
      console: {
        log: (...args: unknown[]) => { /* capture */ },
        error: (...args: unknown[]) => { /* capture */ },
      },
    },
  });
}
```

### 5.3 Distributed Locking

```typescript
// app/src/lib/distributed-lock.ts
import Redlock from 'redlock';

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
});

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = await redlock.acquire([key], 30000);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
```

### 5.4 HA Stack Reference

```yaml
# docker-compose.ha.yml (à créer)
version: '3.8'

services:
  postgres_primary:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    command: >
      postgres
      -c wal_level=replica
      -c max_wal_senders=10
      -c hot_standby=on
    volumes:
      - postgres_primary:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

  postgres_replica:
    image: postgres:16-alpine
    command: >
      postgres
      -c hot_standby=on
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      postgres_primary:
        condition: service_healthy
    volumes:
      - postgres_replica:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/redis/sentinel.conf
    environment:
      SENTINEL_DOWN_AFTER: 5000
      SENTINEL_FAILOVER_TIMEOUT: 60000

  hive_app:
    image: ${HIVE_IMAGE}
    deploy:
      replicas: 3
    environment:
      DATABASE_URL: ${DATABASE_URL_REPLICA}
      REDIS_URL: ${REDIS_URL}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro

  traefik:
    image: traefik:v3.0
    command:
      - --providers.docker
      - --entrypoints.websecure
      - --certificatesresolvers.letsencrypt
    ports:
      - "443:443"
      - "80:80"
```

---

## 6. Roadmap de Correction

### Sprints Recommandés

#### Sprint 1: Security Hardening (2 semaines)
| Tâche | Début | Fin | Assignee |
|-------|-------|-----|----------|
| MFA TOTP implementation | J1 | J5 | — |
| Workflow sandbox (VM2) | J1 | J3 | — |
| Error logging fixes | J4 | J6 | — |
| Command injection validation | J5 | J7 | — |
| Distributed locking | J8 | J10 | — |
| Review & testing | J11 | J14 | — |

#### Sprint 2: Reliability (2 semaines)
| Tâche | Début | Fin | Assignee |
|-------|-------|-----|----------|
| E2E tests (10 scenarios) | J1 | J7 | — |
| PostgreSQL replication | J3 | J5 | — |
| Redis Sentinel setup | J5 | J7 | — |
| Backup automation | J8 | J10 | — |
| HA docker-compose | J8 | J12 | — |
| Integration testing | J13 | J14 | — |

#### Sprint 3: Scalability (2 semaines)
| Tâche | Début | Fin | Assignee |
|-------|-------|-----|----------|
| Helm chart (Hive app) | J1 | J5 | — |
| Multi-replica setup | J3 | J6 | — |
| Load balancer config | J6 | J8 | — |
| Pagination audit logs | J8 | J10 | — |
| Circuit breaker | J10 | J12 | — |
| Load testing | J13 | J14 | — |

#### Sprint 4: Polish (1 semaine)
| Tâche | Début | Fin | Assignee |
|-------|-------|-----|----------|
| SLO definitions | J1 | J2 | — |
| Alerting rules | J2 | J3 | — |
| API documentation | J3 | J5 | — |
| Large file refactor | J5 | J7 | — |
| Performance benchmarks | J5 | J7 | — |

---

## Annexe: Fichiers à Modifier

### Fichiers Critiques à Corriger

| Fichier | Actions Requises |
|---------|------------------|
| `app/src/lib/workflow-executor.ts` | Remplacer new Function(), ajouter sandbox |
| `app/src/lib/cloud-hypervisor.ts` | Validation spawn(), sanitization |
| `app/src/lib/auth.ts` | Ajouter MFA |
| `app/src/lib/authorize.ts` | Ajouter error logging, distributed lock |
| `app/src/lib/session-security.ts` | Race condition fix |
| `app/src/lib/redis.ts` | Cleanup shutdown |
| `docker/docker-compose.prod.yml` | HA, backup automation |
| `deploy/helm/` | Ajouter hive-app chart |

### Nouveaux Fichiers à Créer

| Fichier | Purpose |
|---------|---------|
| `app/src/lib/mfa.ts` | TOTP implementation |
| `app/src/lib/workflow-sandbox.ts` | VM2 sandbox |
| `app/src/lib/distributed-lock.ts` | Redlock implementation |
| `docker/docker-compose.ha.yml` | HA reference |
| `deploy/helm/hive-app/` | Core app Helm chart |
| `app/e2e/agent.spec.ts` | Agent E2E tests |
| `app/e2e/auth.spec.ts` | Auth E2E tests |

---

*Document généré le 27 Mars 2026*
*Dernière mise à jour : Audit complet enterprise-grade Hive*
