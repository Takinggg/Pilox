# CDC — Landing Page Hive

> **Type** : Cahier des charges complet pour la landing page marketing de Hive
> **Version** : 1.0 — 2026-03-21
> **Auteur** : Équipe Hive
> **Audience** : Développeur front-end / intégrateur

---

## 1. Résumé exécutif

Hive est une **infrastructure open-source self-hosted pour agents IA** — un véritable "OS pour agents". La landing page doit positionner Hive comme **la plateforme la plus avancée au monde** pour déployer, orchestrer et sécuriser des agents IA, avec une vision produit claire : du développeur solo à l'entreprise multi-site planétaire.

**URL cible** : `https://hive.example.com` (à confirmer)
**Licence** : BSL 1.1 (free self-hosted, commercial pour SaaS tiers, conversion Apache 2.0 en 2030)

---

## 2. Objectifs de la landing page

| # | Objectif | KPI cible |
|---|----------|-----------|
| O1 | **Acquisition** — Convertir les visiteurs en utilisateurs (clone GitHub / Docker install) | Taux de clic CTA principal > 8% |
| O2 | **Éducation** — Faire comprendre ce qu'est Hive en < 10 secondes | Scroll depth > 60% |
| O3 | **Crédibilité technique** — Prouver la profondeur de l'architecture | Temps moyen sur page > 3 min |
| O4 | **Différenciation** — Se démarquer de LangGraph, CrewAI, AutoGen, Dify, etc. | Mention concurrents dans la section comparaison |
| O5 | **Lead commercial** — Capter les prospects Enterprise / licence commerciale | Formulaire de contact Enterprise |
| O6 | **Communauté** — Diriger vers GitHub, Discord, docs | Clics vers GitHub > 5% |

---

## 3. Cible / Personas

| Persona | Profil | Besoin principal | Ce qu'il veut voir |
|---------|--------|------------------|--------------------|
| **Dev Indie / Hacker** | Développeur solo, side-project IA | Installer et jouer en 5 min | Quick start, Docker one-liner, screenshots |
| **Tech Lead / Architect** | Équipe 5-20 devs, startup ou scale-up | Architecture sérieuse, extensibilité | Diagramme d'archi, stack technique, protocoles |
| **DevOps / SRE** | Responsable infra | Self-hosted, sécurité, observabilité | Deployment options, monitoring, security stack |
| **CTO / VP Eng** | Décideur achat | ROI, licence, support, roadmap | Pricing, Enterprise features, compliance |
| **AI/ML Engineer** | Spécialiste agents / LLM | Multi-model, orchestration, GPU | Model management, WASM/Firecracker, GPU scheduling |

---

## 4. Architecture de la page (sections)

### 4.0 — Navigation (sticky header)

- Logo Hive (lien home)
- Links : Features | Architecture | Security | Marketplace | Pricing | Docs
- CTA : **"Get Started"** (lien GitHub) + **"Book a Demo"** (Enterprise)
- GitHub stars badge (live count)
- Dark mode toggle

---

### 4.1 — Hero Section

**Headline** :
> **The Self-Hosted AI Agent Operating System**

**Subheadline** :
> Deploy, orchestrate, and secure AI agents on your own infrastructure. Open-source. Production-ready. Planetary-scale.

**CTA principal** : `Get Started — It's Free` → lien vers docs/GETTING_STARTED.md ou GitHub
**CTA secondaire** : `Watch Demo` → vidéo ou GIF animé du dashboard

**Éléments visuels** :
- Screenshot/mockup du dashboard Hive (agents list, agent detail avec status)
- Animation subtile : particules/nodes interconnectés symbolisant le mesh
- Badge "BSL 1.1 — Free for self-hosted use"
- Stats en temps réel ou statiques : "60+ OSS technologies" | "9 architecture layers" | "A2A + MCP native"

---

### 4.2 — Problem Statement ("Why Hive?")

**Titre** : *AI agents are powerful. Managing them shouldn't be painful.*

3-4 pain points avec icônes :

| Pain | Description |
|------|-------------|
| **Cloud Lock-in** | Most agent platforms force you into their cloud. Your data, your models, their rules. |
| **Security Gaps** | Running agents without isolation is like running code without containers — in 2015. |
| **No Orchestration** | Agents can't discover, communicate, or collaborate. They're islands. |
| **Scaling Nightmare** | Going from 1 agent to 100 means re-architecting everything. |

**Transition** : "Hive solves all of this. On your hardware. Under your control."

---

### 4.3 — Features Overview (grille 3×3 ou 4×3)

Chaque feature = icône + titre + description 2 lignes + lien "Learn more"

#### Catégorie : Core Platform

| Feature | Description |
|---------|-------------|
| **Agent Dashboard** | Web UI to create, monitor, start/stop/pause/resume agents. Real-time status, logs, and metrics. |
| **Firecracker microVMs** | Each agent runs in its own lightweight VM — 125ms cold start, full Linux, hardware isolation. |
| **WASM Tier (coming)** | Lightweight agents in WebAssembly — <5ms cold start, sandboxed, via Wasmtime + Extism. |
| **Model Management** | Local LLMs via Ollama integration. Switch between Ollama and vLLM. Quantization routing per tier. |
| **Docker + Compose** | Production-ready Docker Compose. One command to deploy Hive + Postgres + Redis + Ollama. |
| **Setup Wizard** | First-run web wizard — admin account, instance config, AI backend detection, federation setup. |

#### Catégorie : Agent Mesh & Protocols

| Feature | Description |
|---------|-------------|
| **A2A Protocol (native)** | Agent-to-Agent communication via the Linux Foundation standard. JSON-RPC, SSE streaming, Agent Cards. |
| **MCP Support** | Model Context Protocol — every agent is an MCP server. 16,000+ existing MCP tools compatible. |
| **`@hive/a2a-sdk`** | The world's most secure A2A SDK. Fork of the official SDK with native Noise E2E encryption, SPIFFE identity, schema enforcement, and anti-injection. |
| **Federation** | Connect multiple Hive instances across the globe. Signed manifests, JWT Ed25519, anti-replay. |
| **Planetary Mesh** | Registry, gateway, transport bridge — discover and connect agents across the Internet. |
| **Redis Bus v1** | Local pub/sub with HMAC integrity. NATS JetStream for WAN (future). |

#### Catégorie : Security (Zero-Trust)

| Feature | Description |
|---------|-------------|
| **5-Layer Security** | eBPF kernel monitoring → Firecracker isolation → Zero-trust networking → Message sanitization → Semantic Watchdog. |
| **SPIFFE/SPIRE** | Automatic workload identity and mTLS between all agents. Short-lived certificates, auto-rotation. |
| **Noise Protocol E2E** | End-to-end encryption between agents. Even the Hive server can't read the messages. Forward secrecy per-message. |
| **Anti Prompt Injection** | 4-layer defense: Schema enforcement + LLM Guard + LlamaFirewall + NeMo Guardrails. |
| **Capability Tokens** | Tenuo-based capability system — agents receive only the minimum permissions for their task. |
| **Immutable Audit Trail** | Hash-chain in PostgreSQL. Optional Sigstore Rekor anchoring for external verification. |

#### Catégorie : Intelligence & Performance

| Feature | Description |
|---------|-------------|
| **LLM Optimization** | Agent sleeping (VM pause/resume), smart proxy, quantization routing, prompt caching, vLLM integration — 3-5x more agents on same hardware. |
| **GPU Scheduling** | Fractional GPU via MIG + HAMi. Dynamic partitioning between agents. |
| **Swarm Patterns** | Handoff, graph workflows, SOP-driven, stigmergy, consensus voting — emergent self-organization. |
| **Shared Memory** | pgvector collective memory + Loro CRDTs for conflict-free shared state across agents. |
| **OpenTelemetry** | Native OTel instrumentation. Causal tracing across the entire swarm. ClickHouse + Jaeger. |
| **Confidential Computing** | Hardware-encrypted agents via AMD SEV-SNP / Intel TDX. Even the admin can't read agent memory. |

---

### 4.4 — Architecture Diagram (section visuelle)

**Titre** : *9 layers. One platform.*

Diagramme interactif ou statique reprenant l'architecture en couches :

```
Layer 8   Swarm Intelligence      Genetic evolution, emergent consensus, stigmergy
Layer 7   GPU Scheduling          Dynamic partitioning, fractional allocation
Layer 6   Observability           eBPF kernel tracing, causal tracing, energy monitoring
Layer 5   Security                Zero-trust, capabilities, semantic watchdog
Layer 4   Protocols               MCP (agent↔tools) + A2A (agent↔agent)
Layer 3   Shared Memory           CRDTs, vector DB, collective neural memory
Layer 2   Agent Mesh              Gossip discovery, NATS messaging, intent networking
Layer 1   Execution               Firecracker microVMs + WASM lightweight tier
Layer 0   Bare Metal              Confidential computing, CXL memory pooling
```

**Interaction** : clic sur chaque couche → description détaillée + technologies utilisées (avec logos OSS)

---

### 4.5 — Marketplace

**Titre** : *Discover, deploy, and share agents*

- Catalog d'agents fédéré depuis des registries connectés
- One-click deploy depuis le marketplace vers votre instance
- Buyer configuration — checklist de pré-déploiement
- Pricing display (label, tokens/million, notes)
- Bookmarks / pins pour agents favoris
- Stats de déploiement locaux par agent

**Visuel** : screenshot du marketplace UI (grille de cards agents avec tags, filtres, bouton Deploy)

---

### 4.6 — "How It Works" (3-step flow)

**Titre** : *From zero to agents in 5 minutes*

| Step | Titre | Description |
|------|-------|-------------|
| 1 | **Deploy** | `git clone` + `docker compose up` — Hive + Postgres + Redis + Ollama running in seconds. |
| 2 | **Create** | Open the dashboard, create an agent, choose a model, configure capabilities. Or import from the marketplace. |
| 3 | **Scale** | Add federation peers, connect to the planetary mesh, deploy GPU scheduling. Your agents talk to the world. |

**Code snippet** (inline) :
```bash
git clone https://github.com/Takinggg/Hive.git && cd Hive/docker
cp .env.example .env  # fill HIVE_DOMAIN, POSTGRES_PASSWORD, AUTH_SECRET, ENCRYPTION_KEY
docker compose -f docker-compose.prod.yml up -d
# Open https://your-domain.com/setup → create admin → done
```

---

### 4.7 — Comparison Table

**Titre** : *How Hive compares*

| Feature | Hive | LangGraph | CrewAI | AutoGen | Dify | OpenAI Swarm |
|---------|------|-----------|--------|---------|------|-------------|
| Self-hosted | Yes (BSL 1.1) | Cloud + OSS | OSS | OSS | OSS + Cloud | Framework only |
| Agent isolation (microVM) | Firecracker + WASM | No | No | No | Docker only | No |
| A2A protocol (LF standard) | Native | No | No | No | No | Custom only |
| MCP support | Native | Plugin | No | No | Yes | No |
| E2E encryption (Noise) | Yes | No | No | No | No | No |
| Zero-trust identity (SPIFFE) | Yes | No | No | No | No | No |
| GPU fractional scheduling | MIG + HAMi | No | No | No | No | No |
| Planetary mesh / federation | Yes | No | No | No | No | No |
| Confidential computing (TEE) | AMD SEV / Intel TDX | No | No | No | No | No |
| Agent marketplace | Built-in | No | No | No | Yes | No |
| Anti prompt injection (4 layers) | Yes | No | No | No | Partial | No |
| Swarm intelligence patterns | 5 patterns | Graph only | Crew only | Group chat | Workflow | Handoff only |
| Audit trail (hash-chain) | Yes | No | No | No | No | No |
| Web dashboard | Yes | LangSmith (SaaS) | No | No | Yes | No |
| LLM optimization (sleep/resume) | Yes | No | No | No | No | No |

**Note en bas** : "Comparison as of March 2026. Features marked reflect publicly documented capabilities."

---

### 4.8 — Security Deep Dive

**Titre** : *Security is not a feature. It's the architecture.*

Section visuelle avec le schéma des 5 couches de sécurité + focus sur :

1. **OWASP Top 10 for Agentic Applications** — Hive couvre les 10 risques (table)
2. **Least-Agency principle** — agents receive only the minimum autonomy required
3. **Attack vectors addressed** : inter-agent prompt injection, agent impersonation, Sybil attacks, memory poisoning, semantic drift, Agent Card spoofing
4. **Crypto stack** : Ed25519 identity, Noise Protocol E2E, libsodium, hash-chain audit, SPIFFE/SPIRE, step-ca PKI, AES-256-GCM, Sigstore/Cosign, VirTEE attestation

---

### 4.9 — Open Source Stack (logos wall)

**Titre** : *Built on the shoulders of giants. 60+ battle-tested open-source tools.*

Grille de logos avec nom + catégorie, organisée par couche :

| Catégorie | Technologies |
|-----------|-------------|
| **Runtime** | Firecracker, Wasmtime, Extism, WasmEdge, Fermyon Spin |
| **Messaging** | NATS, Redis, Apache Iggy |
| **Database** | PostgreSQL 16, pgvector, pgvectorscale, LanceDB |
| **CRDTs** | Loro, Automerge, Electric SQL |
| **Identity** | SPIFFE/SPIRE, step-ca, Sigstore/Cosign |
| **Security** | OPA, Casbin, SpiceDB, Tetragon, Cilium, Falco, LlamaFirewall, NeMo Guardrails |
| **Crypto** | libsodium, Noise (snow), Ed25519, VirTEE |
| **Observability** | OpenTelemetry, ClickHouse, Jaeger, Prometheus, Quickwit, HyperDX, Kepler |
| **GPU** | KAI Scheduler, HAMi, mig-parted, DCGM, GPUStack |
| **Confidential** | Kata Containers, CoCo, VirTEE sev/tdx, Occlum |
| **Protocols** | A2A (Linux Foundation), MCP (AAIF/Linux Foundation) |
| **P2P** | libp2p, memberlist, mDNS |
| **AI Safety** | LlamaFirewall, LLM Guard, NeMo Guardrails |
| **Optimization** | pymoo, scikit-opt |
| **App** | Next.js, React, Tailwind CSS, Drizzle ORM, NextAuth |

**Note** : "All Apache 2.0 / MIT / BSD — no AGPL dependencies in the core."

---

### 4.10 — Pricing / License

**Titre** : *Open-source forever. Commercial when you need it.*

| Tier | Prix | Inclus |
|------|------|--------|
| **Community** | **Free** | Self-hosted, all core features, unlimited agents, BSL 1.1 (converts to Apache 2.0 in 2030) |
| **Pro** (coming) | $XX/mo | Stigmergic coordination, swarm consensus, semantic watchdog, evolutionary optimization, advanced anomaly detection, multi-site mesh (libp2p), GPU-aware routing, confidential computing integration, enterprise audit (Rekor) |
| **Enterprise** | Contact us | Custom SLA, dedicated support, commercial license for hosted offering, white-label, priority roadmap |

**FAQ rapide** :
- "Can I use Hive for free?" → Yes, for self-hosted, internal, dev, and academic use.
- "When do I need a commercial license?" → Only if you offer Hive as a hosted service to third parties.
- "Will it stay open-source?" → BSL 1.1 converts to Apache 2.0 on March 21, 2030.

---

### 4.11 — Testimonials / Social Proof (placeholder)

- GitHub stars count
- Contributors count
- "Used by X teams" (à remplir)
- Logos entreprises early adopters (à remplir)
- Quotes de développeurs beta

---

### 4.12 — Roadmap (timeline visuelle)

| Phase | Période | Focus |
|-------|---------|-------|
| **Phase 1 — Foundation** | Months 1-3 | MCP native, NATS messaging, pgvector, @hive/a2a-sdk fork, SPIFFE identity, OpenTelemetry, Sigstore |
| **Phase 2 — Intelligence** | Months 3-6 | WASM Tier 1, Schema enforcement + anti-injection, Loro CRDTs, OPA policies, LanceDB, SDK publish npm/PyPI |
| **Phase 3 — Security** | Months 6-9 | Tetragon eBPF, Cilium network, SpiceDB auth, ClickHouse tracing, Falco alerting |
| **Phase 4 — Advanced** | Months 9-12 | KAI GPU scheduler, Confidential Computing, stigmergy, Semantic Watchdog, evolutionary optimization, Apache Iggy |
| **Phase 5 — Endgame** | Year 2+ | libp2p multi-site WAN, CXL 3.0 memory pooling, causal inference, formal verification |

---

### 4.13 — CTA Final / Footer

**Titre** : *Your agents deserve better infrastructure.*

**CTA** :
- **Primary** : `Get Started` → GitHub clone instructions
- **Secondary** : `Read the Docs` → docs/GETTING_STARTED.md
- **Tertiary** : `Contact Sales` → formulaire Enterprise

**Footer** :
- Logo Hive
- Links : Docs | GitHub | Discord | Blog | Changelog | Status
- Links : Privacy Policy | Terms | License (BSL 1.1) | Commercial License
- Contact : contact@maxence.design
- "Made with love by the Hive team"
- Copyright 2026

---

## 5. Spécifications techniques

### 5.1 Stack recommandée

| Élément | Technologie |
|---------|-------------|
| Framework | Next.js 15+ (static export ou SSR) ou Astro |
| Style | Tailwind CSS 4 |
| Animations | Framer Motion ou GSAP |
| Icons | Lucide React ou Heroicons |
| Fonts | Inter (body) + JetBrains Mono (code) |
| Hosting | Vercel, Cloudflare Pages, ou self-hosted |
| Analytics | Plausible (privacy-first) ou PostHog |

### 5.2 Performance

- **Lighthouse score** : > 95 sur Performance, Accessibility, Best Practices, SEO
- **LCP** : < 2.5s
- **CLS** : < 0.1
- **Bundle size** : < 200KB gzip (première charge)
- Images : WebP/AVIF, lazy loading, responsive srcset
- Code blocks : syntax highlighting côté client (Shiki ou Prism)

### 5.3 SEO

- Titre : "Hive — The Self-Hosted AI Agent Operating System"
- Meta description : "Deploy, orchestrate, and secure AI agents on your own infrastructure. Open-source, production-ready, planetary-scale. Firecracker microVMs, A2A protocol, zero-trust security."
- Open Graph + Twitter Cards avec preview du dashboard
- Schema.org SoftwareApplication markup
- Sitemap XML
- Canonical URLs

### 5.4 Responsive

- Mobile-first
- Breakpoints : 640px / 768px / 1024px / 1280px / 1536px
- Navigation mobile : hamburger → drawer
- Comparison table : horizontal scroll sur mobile
- Architecture diagram : simplifié sur mobile (accordéon)

### 5.5 Accessibilité

- WCAG 2.1 AA minimum
- Contraste texte/fond > 4.5:1
- Focus visible sur tous les éléments interactifs
- Alt text sur toutes les images
- Navigation clavier complète
- Skip to content link

### 5.6 Dark Mode

- Défaut : dark (audience dev)
- Toggle dans le header
- Respect de `prefers-color-scheme`
- Pas de flash FOUC

---

## 6. Contenu rédactionnel (guidelines)

### 6.1 Tone of voice

- **Technique mais accessible** — pas de jargon gratuit, mais ne pas dumifier non plus
- **Confiant sans être arrogant** — "the most advanced" est OK quand c'est factuel
- **Direct** — phrases courtes, verbes d'action
- **Open-source spirit** — transparence, communauté, contribution
- Langue principale : **anglais** (audience internationale)

### 6.2 Mots-clés SEO cibles

| Primaire | Secondaire |
|----------|-----------|
| self-hosted AI agent | AI agent orchestration |
| AI agent operating system | agent-to-agent protocol |
| AI agent infrastructure | Firecracker microVM agents |
| open-source AI platform | MCP agent platform |
| AI agent security | zero-trust AI agents |
| deploy AI agents | AI agent marketplace |
| AI agent mesh | planetary AI network |

### 6.3 Call-to-Action (hiérarchie)

1. **Get Started** (primary, partout) → `https://github.com/Takinggg/Hive`
2. **Read the Docs** → `docs/GETTING_STARTED.md`
3. **Star on GitHub** → repo
4. **Join Discord** → communauté
5. **Contact Sales** → formulaire Enterprise
6. **Book a Demo** → Calendly ou équivalent

---

## 7. Assets requis

### 7.1 Screenshots / Visuels

| Asset | Description | Priorité |
|-------|-------------|----------|
| Dashboard overview | Liste des agents avec statuts | P0 |
| Agent detail page | Status, logs, pause/resume, token usage | P0 |
| Marketplace catalog | Grille d'agents avec tags et filtres | P0 |
| Agent import wizard | Flow d'import depuis le marketplace | P1 |
| Settings page | Federation, A2A, mesh config | P1 |
| Setup wizard | First-run onboarding | P1 |
| Terminal / CLI | `hive init`, `hive doctor` output | P2 |

### 7.2 Diagrammes

| Diagramme | Description | Priorité |
|-----------|-------------|----------|
| Architecture 9 couches | Layered architecture interactif | P0 |
| MCP + A2A flow | Agent → Tools (MCP) / Agent → Agent (A2A) | P0 |
| Security 5 layers | Kernel → VM → Network → Message → Semantic | P0 |
| Deployment topology | Docker Compose / Helm / K8s | P1 |
| Federation mesh | Multi-instance connected via WAN | P1 |
| LLM optimization flow | Sleep → Wake → Route → Cache → Serve | P2 |

### 7.3 Vidéo / Animation

| Asset | Description | Priorité |
|-------|-------------|----------|
| Hero animation | Agents interconnectés, mesh, particules | P0 |
| Demo GIF/video | 60s dashboard walkthrough | P1 |
| Architecture animation | Zoom into each layer on scroll | P2 |

---

## 8. Pages supplémentaires (hors landing, à prévoir)

| Page | Contenu |
|------|---------|
| `/docs` | Redirect vers documentation technique |
| `/pricing` | Détail des tiers + FAQ |
| `/enterprise` | Formulaire + features Enterprise |
| `/security` | Security whitepaper résumé |
| `/blog` | Articles techniques, changelog, case studies |
| `/changelog` | Release notes |
| `/community` | GitHub, Discord, Contributing guide |

---

## 9. Données techniques à afficher (chiffres clés)

Ces chiffres proviennent directement de la documentation technique :

| Donnée | Valeur | Source |
|--------|--------|--------|
| Firecracker cold start | ~125ms | TECH_VISION.md |
| WASM cold start | <5ms | TECH_VISION.md |
| WASM memory footprint | ~8-15MB | TECH_VISION.md |
| Firecracker memory | ~128MB+ | TECH_VISION.md |
| Capability token verification | ~27 microseconds | TECH_VISION.md |
| OSS technologies integrated | 60+ | TECH_VISION.md |
| Architecture layers | 9 | TECH_VISION.md |
| A2A organizations | 150+ (Linux Foundation) | TECH_VISION.md |
| MCP servers existing | 16,000+ | TECH_VISION.md |
| LLM optimization gain | 3-5x more agents on same hardware | llm-optimization.md |
| VM pause/resume time | ~125ms | llm-optimization.md |
| VRAM savings (Q4 vs FP16) | 2GB vs 8GB (2-3x more agents) | llm-optimization.md |
| Prompt pre-warming gain | ~10x faster first request | llm-optimization.md |
| pgvectorscale vs Pinecone | 28x lower p95 latency | TECH_VISION.md |
| Noise Protocol handshake | 1 round-trip (0-RTT possible) | TECH_VISION.md |
| Noise code size | ~5,000 lines vs TLS ~50,000+ | TECH_VISION.md |
| OWASP agentic risks covered | 10/10 | TECH_VISION.md |
| Apache Iggy throughput | Millions msg/s | TECH_VISION.md |
| Anti-injection effectiveness | >90% (LlamaFirewall on AgentDojo) | TECH_VISION.md |
| SPIFFE cert TTL | ~1h, auto-rotation | TECH_VISION.md |
| BSL → Apache 2.0 conversion | March 21, 2030 | LICENSE |
| Planetary mesh phases | P1-P6 | MESH_PLANETARY_PRODUCT.md |

---

## 10. Sections "killer" (différenciateurs uniques)

Ces éléments sont **introuvables chez les concurrents** et doivent être mis en avant visuellement :

### 10.1 — `@hive/a2a-sdk` : "The Best A2A SDK in the World"

> Fork de l'officiel A2A SDK (Apache 2.0) avec sécurité native :
> - Noise Protocol E2E encryption
> - SPIFFE workload identity
> - Schema enforcement anti-injection
> - LlamaFirewall integration
> - Hash-chain audit trail
> - Capability tokens (Tenuo)
> - **100% compatible** avec le standard A2A
> - **Drop-in replacement** — changer 1 import

**Le flywheel** : SDK open-source → adoption → standard grandit → Hive grandit

### 10.2 — Firecracker + WASM Dual Tier

> Seule plateforme avec 2 tiers d'exécution :
> - **Tier 1 (WASM)** : <5ms cold start, ~8MB RAM, sandboxed
> - **Tier 2 (Firecracker)** : ~125ms cold start, full Linux, hardware isolation
> - Escalation automatique : l'agent commence en WASM, escalade vers Firecracker si besoin

### 10.3 — Confidential Computing

> Agents dans des enclaves hardware chiffrées (AMD SEV-SNP / Intel TDX).
> **Même l'administrateur ne peut pas lire la mémoire de l'agent.**

### 10.4 — Semantic Watchdog (Innovation Hive)

> Un agent IA dédié à la supervision sémantique :
> - Observe les **décisions** des agents, pas juste les messages
> - Détecte les dérives comportementales
> - Circuit breaker automatique
> - **De l'IA pour sécuriser l'IA** — le problème que personne n'a résolu

### 10.5 — Stigmergy (Bio-inspired coordination)

> Agents laissent des "phéromones" dans un environnement partagé. Pas de messages directs.
> Auto-organisation émergente inspirée des colonies de fourmis.

### 10.6 — Planetary Mesh

> De votre laptop à l'Internet des agents :
> - Mesh local (Redis v1) → Federation (JWT Ed25519, signed manifests) → Planetary (registry, gateway, transport) → Open mesh (DHT, relays)
> - /.well-known/hive-mesh.json pour la découverte
> - Registres fédérés avec preuve Ed25519

---

## 11. Anti-patterns (ce qu'il ne faut PAS faire)

| Ne pas | Pourquoi |
|--------|----------|
| Parler de "blockchain" | Hive utilise des hash-chains, pas de blockchain. Le mot est toxique pour l'audience dev. |
| Promettre des features non implémentées comme "disponibles" | Distinguer clairement "shipped" vs "roadmap" vs "vision" |
| Utiliser du jargon Web3/crypto | Audience = devs infra/AI, pas crypto bros |
| Comparer agressivement les concurrents | Rester factuel et respectueux dans la table de comparaison |
| Ignorer le modèle BSL 1.1 | Le mentionner clairement — ce n'est PAS Apache 2.0 aujourd'hui, et c'est OK |
| Mettre des prix fantaisistes | Laisser "coming" si pas encore défini |
| Cacher que certaines features sont vision/roadmap | Utiliser des badges "shipped" / "beta" / "planned" |

---

## 12. Critères d'acceptation (Definition of Done)

- [ ] Toutes les sections 4.0 à 4.13 sont implémentées
- [ ] Responsive testé sur : iPhone SE, iPhone 14, iPad, MacBook 13", écran 27"
- [ ] Dark mode fonctionnel sans FOUC
- [ ] Lighthouse > 95 sur les 4 métriques
- [ ] Tous les liens externes fonctionnels (GitHub, docs)
- [ ] SEO : titre, meta, OG, schema.org, sitemap
- [ ] WCAG 2.1 AA vérifié (axe-core ou équivalent)
- [ ] Code blocks avec syntax highlighting
- [ ] Screenshots/mockups du dashboard intégrés
- [ ] Formulaire Enterprise fonctionnel (envoi email ou webhook)
- [ ] Analytics en place
- [ ] Pas de contenu placeholder ("Lorem ipsum") en production
- [ ] Review rédactionnelle par un native English speaker
- [ ] Test de charge : page servie en < 1s (TTFB) sous 100 req/s

---

## 13. Inspirations visuelles

Sites de référence pour le style/ton :

| Site | Ce qu'on retient |
|------|-----------------|
| **Supabase** (supabase.com) | Open-source positioning, developer-first, dark theme, code snippets |
| **Vercel** (vercel.com) | Clean hero, animation mesh/particles, developer UX |
| **Linear** (linear.app) | Minimalisme, vitesse perçue, dark mode par défaut |
| **Fly.io** (fly.io) | Infrastructure self-hosted vibe, terminal aesthetic |
| **Coolify** (coolify.io) | Self-hosted alternative positioning, prix transparent |
| **Fireworks AI** (fireworks.ai) | AI inference platform, GPU focus |
| **Tailscale** (tailscale.com) | Mesh networking made simple, clear diagrams |

---

## 14. Timeline estimée

| Phase | Durée | Livrable |
|-------|-------|----------|
| **Design** | 1 semaine | Maquettes Figma/Pencil haute fidélité |
| **Contenu** | 1 semaine | Textes finaux anglais, screenshots, diagrammes |
| **Développement** | 2 semaines | Intégration complète + responsive + dark mode |
| **QA** | 3 jours | Lighthouse, accessibilité, responsive, liens, SEO |
| **Launch** | 1 jour | Deploy + analytics + monitoring |

**Total estimé : ~4-5 semaines**

---

## Annexes

### A. Palette de couleurs suggérée

| Token | Valeur | Usage |
|-------|--------|-------|
| `--hive-primary` | `#F59E0B` (amber-500) | Accents, CTA, logo |
| `--hive-bg-dark` | `#0A0A0A` | Background dark mode |
| `--hive-bg-light` | `#FAFAFA` | Background light mode |
| `--hive-surface` | `#18181B` | Cards dark mode |
| `--hive-text` | `#F4F4F5` | Text dark mode |
| `--hive-text-muted` | `#A1A1AA` | Secondary text |
| `--hive-border` | `#27272A` | Borders dark mode |
| `--hive-success` | `#22C55E` | Running status |
| `--hive-warning` | `#EAB308` | Paused status |
| `--hive-error` | `#EF4444` | Error/stopped status |
| `--hive-info` | `#3B82F6` | Links, info |

### B. Repository & liens utiles

| Ressource | URL |
|-----------|-----|
| GitHub | https://github.com/Takinggg/Hive |
| Docs index | docs/README.md |
| Getting Started | docs/GETTING_STARTED.md |
| Server Install | docs/SERVER_INSTALL.md |
| Tech Vision | docs/TECH_VISION.md |
| Threat Model | docs/THREAT_MODEL.md |
| A2A Integration | docs/A2A_INTEGRATION.md |
| Marketplace | docs/MARKETPLACE_ARCHITECTURE.md |
| Mesh Product | docs/MESH_PLANETARY_PRODUCT.md |
| Contact | contact@maxence.design |
