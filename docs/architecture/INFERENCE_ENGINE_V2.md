# Pilox Inference Engine V2 — Smart Model Hosting

## Vision

Quand un user crée un agent dans Pilox, il ne devrait pas se soucier de l'infra. Il choisit un modèle, Pilox crée **automatiquement l'instance d'inference la plus optimale** pour son hardware.

```
User crée un agent → choisit "Llama 3.3 70B"
  ↓
Pilox détecte le hardware:
  - GPU: RTX 3080 (10GB VRAM)
  - RAM: 32GB
  - Disk: 500GB SSD
  ↓
Pilox décide automatiquement:
  - Backend: vLLM + AWQ 4-bit (35GB poids)
  - Offload: 25GB en RAM, 10GB en VRAM
  - KV Cache: TurboQuant 3-bit
  - Speed boost: Speculative Decoding (EAGLE3 draft model)
  - Résultat: ~10-15 tokens/s
  ↓
L'instance LLM tourne → l'agent peut l'appeler
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 PILOX INFERENCE ROUTER               │
│                                                      │
│  Agent demande inference → Router choisit le backend │
│  le plus optimal pour ce modèle + ce hardware        │
└──────────────┬──────────────────────────┬────────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │   OLLAMA (default)   │    │   vLLM (GPU power)  │
    │                      │    │                      │
    │ • Modèles <13B       │    │ • Modèles >13B       │
    │ • GGUF Q4/Q8         │    │ • AWQ/GPTQ 4-bit     │
    │ • CPU + GPU auto     │    │ • TurboQuant KV       │
    │ • Simple, rapide     │    │ • Speculative Decode  │
    │ • Pull en 1 clic     │    │ • CPU offload         │
    └──────────────────────┘    └──────────────────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │  POWERINFER (future) │    │   AIRLLM (future)   │
    │                      │    │                      │
    │ • Sparse activation  │    │ • Layer-wise         │
    │ • 11x faster         │    │ • 70B sur 4GB VRAM   │
    │ • Hot/cold neurons   │    │ • Très lent (~1t/s)  │
    │ • Consumer GPU opti  │    │ • Fallback ultime    │
    └──────────────────────┘    └──────────────────────┘
```

## Technologies d'optimisation

### Tier 1 — Déjà intégrées dans Pilox

| Tech | Ce qu'elle fait | Impact | Status |
|------|----------------|--------|--------|
| **AWQ 4-bit** | Compresse les poids du modèle | 140GB → 35GB | ✅ vLLM natif |
| **GPTQ 4-bit** | Alternative à AWQ | ~même résultat | ✅ vLLM natif |
| **GGUF Q4_K_M** | Quantization Ollama | Modèles jusqu'à 13B easy | ✅ Ollama natif |
| **TurboQuant** | Compresse KV cache 3-bit | 6x moins de cache VRAM | ✅ Installé dans vLLM |
| **CPU Offload** | Déborde les poids en RAM | GPU+RAM = gros modèles | ✅ vLLM flag |

### Tier 2 — À intégrer (court terme)

| Tech | Ce qu'elle fait | Impact | Effort |
|------|----------------|--------|--------|
| **Speculative Decoding** | Petit modèle propose, gros vérifie | 2-3x plus rapide | Moyen — flag vLLM `--speculative-model` |
| **Prefix Caching** | Cache les prompts communs | 2x faster pour prompts répétitifs | Faible — déjà activé |

### Tier 3 — À intégrer (moyen terme)

| Tech | Ce qu'elle fait | Impact | Effort |
|------|----------------|--------|--------|
| **PowerInfer** | Sparse activation (hot/cold neurons) | 11x faster sur consumer GPU | Élevé — nouveau backend |
| **AirLLM** | Layer-wise (1 couche à la fois) | 70B sur 4GB VRAM | Moyen — nouveau backend |
| **VPTQ 2-bit** | Poids 2-bit (Microsoft) | 35GB → 18GB | Attendre intégration vLLM |
| **LayerSkip** | Skip couches pour tokens faciles | 1.3-2.2x speed | Recherche — pas encore production |

### Tier 4 — Futur (2026-2027)

| Tech | Ce qu'elle fait | Impact |
|------|----------------|--------|
| **NVFP4** (Blackwell) | 4-bit natif hardware NVIDIA | 2x speed sur Blackwell GPUs |
| **Mixture-of-Depths** | Allocation dynamique de compute | Tokens faciles = moins de calcul |
| **GateSkip** | Skip couches par gate appris | Stable, pas besoin de retrain |

## Smart Model Router — Comment ça marche

Quand un agent appelle un modèle, le router décide le backend optimal :

```typescript
function selectBackend(model: string, hardware: HardwareProfile): InferenceConfig {
  const modelSize = getModelSizeGB(model);
  const gpuVram = hardware.gpuVramGB;
  const availableRam = hardware.ramGB - 8; // reserve 8GB for OS

  // Petit modèle → Ollama (simple, rapide)
  if (modelSize <= 8) {
    return { backend: "ollama", quantization: "Q4_K_M" };
  }

  // Modèle moyen, tient en GPU → vLLM AWQ
  if (modelSize * 0.25 <= gpuVram) { // AWQ 4-bit = ~25% of FP16
    return {
      backend: "vllm",
      quantization: "awq",
      turboQuant: true,
      speculativeModel: "Qwen/Qwen3-0.6B", // draft model
    };
  }

  // Gros modèle, GPU + RAM offload → vLLM AWQ + offload
  if (modelSize * 0.25 <= gpuVram + availableRam) {
    const offloadGB = Math.ceil(modelSize * 0.25 - gpuVram);
    return {
      backend: "vllm",
      quantization: "awq",
      cpuOffloadGB: offloadGB,
      turboQuant: true,
      speculativeModel: "Qwen/Qwen3-0.6B",
    };
  }

  // Très gros modèle, pas assez de mémoire → AirLLM (futur)
  return {
    backend: "airllm",
    quantization: "4bit",
    warning: "Layer-wise inference: slow but works on any hardware",
  };
}
```

## Hardware Detection

Au démarrage de Pilox, on détecte :

```typescript
interface HardwareProfile {
  // GPU
  gpuName: string;         // "NVIDIA GeForce RTX 3080"
  gpuVramGB: number;       // 10
  gpuComputeCapability: string; // "8.6"

  // CPU + RAM
  cpuCores: number;        // 16
  ramGB: number;           // 32
  ramSpeed: string;        // "DDR4-3200"

  // Storage
  diskType: "ssd" | "hdd"; // pour AirLLM layer-wise
  diskFreeGB: number;      // 200

  // Capabilities
  canRunVllm: boolean;     // GPU NVIDIA détecté
  canRunOllama: boolean;   // toujours true
  maxModelSizeGB: number;  // calculé: VRAM + RAM offload
}
```

## Matrice de décision par hardware

| Hardware | Petit (<8B) | Moyen (8-32B) | Gros (70B) | Très gros (>100B) |
|----------|------------|---------------|------------|-------------------|
| **Pas de GPU** | Ollama CPU | Ollama CPU (lent) | AirLLM (très lent) | Impossible |
| **RTX 3060 12GB** | Ollama GPU | vLLM AWQ | vLLM AWQ + offload (32GB+ RAM) | AirLLM |
| **RTX 3080 10GB** | Ollama GPU | vLLM AWQ | vLLM AWQ + offload (32GB+ RAM) | AirLLM |
| **RTX 4090 24GB** | Ollama GPU | vLLM AWQ (GPU only) | vLLM AWQ (serré) | vLLM + offload |
| **2x RTX 3090 48GB** | Ollama GPU | vLLM AWQ | vLLM AWQ (GPU only) | vLLM AWQ + offload |
| **A100 80GB** | Overkill | vLLM FP16 | vLLM AWQ | vLLM AWQ |

## UX Flow — Création d'agent

```
1. User clique "New Agent"
2. Choisit un modèle dans le catalogue
   → Pilox affiche les options de quantization:
   - "Standard (Q4) — 4.5GB VRAM, ~30 tok/s" [Recommended]
   - "AWQ 4-bit — 4.5GB VRAM, ~40 tok/s via vLLM"
   - "VPTQ 2-bit — 2.5GB (coming soon)"
   
3. Pilox vérifie le hardware:
   → "Your RTX 3080 (10GB) can run this model ✅"
   → "Estimated speed: ~30 tokens/s"
   → "TurboQuant KV compression: enabled"
   
4. User confirme → Pilox:
   a. Pull le modèle (Ollama ou vLLM selon la taille)
   b. Configure le backend optimal
   c. Active TurboQuant + Speculative Decoding si applicable
   d. Lance l'instance d'inference
   
5. L'agent peut maintenant appeler le modèle via l'API interne
```

## Speculative Decoding — Détail

```
Sans speculative decoding:
  [Gros modèle 70B] → génère 1 token → 100ms → 1 token → 100ms → ...
  = 10 tokens/s

Avec speculative decoding:
  [Petit modèle 1B] → propose 5 tokens → 5ms
  [Gros modèle 70B] → vérifie les 5 d'un coup → 100ms → 4 acceptés
  = ~40 tokens pour 100ms de compute du gros modèle
  = 2-3x plus rapide
```

Pour activer dans vLLM :
```bash
--speculative-model "Qwen/Qwen3-0.6B"
--num-speculative-tokens 5
```

## Implementation Plan

### Phase 1: Hardware Detection API (court terme)
- `GET /api/system/hardware` → retourne `HardwareProfile`
- Détecte GPU via `nvidia-smi`, RAM via `/proc/meminfo`
- Cache le résultat (ne change pas souvent)

### Phase 2: Smart Router (court terme)
- Middleware dans le LLM node qui choisit le backend
- Basé sur le modèle demandé + hardware détecté
- Transparent pour l'agent

### Phase 3: Speculative Decoding (court terme)
- Ajouter `--speculative-model` au vLLM compose
- UI toggle dans Settings → vLLM

### Phase 4: Model Instance Manager (moyen terme)
- Chaque modèle a sa propre "instance" avec sa config optimale
- Plusieurs modèles en parallèle (Ollama = multi-model natif)
- vLLM = 1 modèle par instance, mais on peut lancer plusieurs containers

### Phase 5: PowerInfer Backend (moyen terme)
- Ajouter PowerInfer comme 3ème backend
- Sparse activation = 11x faster sur consumer GPU
- Remplacerait vLLM pour les modèles supportés

### Phase 6: AirLLM Fallback (moyen terme)
- Backend de dernier recours
- 70B sur 4GB VRAM
- Lent mais fonctionne partout

## Conclusion

Le but est que Pilox soit le **meilleur runtime d'inference local au monde** :
- **Aucune configuration manuelle** — tout est auto-détecté
- **Toujours le backend le plus rapide** pour le hardware disponible
- **70B accessible à tout le monde** — même avec un GPU basique
- **Scalable** — du Raspberry Pi à un cluster A100
