# Inference Setup Wizard — User Flow

## Quand ça apparaît
1. **Premier boot** (setup wizard step 5 "Configuration") 
2. **Settings → LLM Configuration** (pour modifier après)
3. **Quand un agent demande un modèle non-disponible**

## Flow

```
┌─────────────────────────────────────────┐
│          LLM Configuration              │
│                                         │
│  How do you want to run AI models?      │
│                                         │
│  ┌───────────────┐  ┌────────────────┐  │
│  │  ⚡ Automatic  │  │  🔧 Expert     │  │
│  │               │  │                │  │
│  │ Pilox scans   │  │ You choose     │  │
│  │ your hardware │  │ every setting  │  │
│  │ and picks the │  │ with live      │  │
│  │ best config   │  │ performance    │  │
│  │               │  │ preview        │  │
│  └───────────────┘  └────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Mode Automatic

```
Step 1: Hardware Scan
┌─────────────────────────────────────────┐
│  🔍 Scanning your hardware...           │
│                                         │
│  GPU:  NVIDIA RTX 3080 (10 GB VRAM) ✅  │
│  RAM:  32 GB DDR4                    ✅  │
│  Disk: 478 GB free (SSD)            ✅  │
│  CPU:  16 cores (Ryzen 7)           ✅  │
│                                         │
│  Pilox recommends:                      │
│  ┌─────────────────────────────────────┐│
│  │ Primary: Ollama (GPU accelerated)   ││
│  │ Large models: vLLM + AWQ 4-bit      ││
│  │ KV Cache: TurboQuant 3-bit          ││
│  │ Speed boost: Speculative Decoding   ││
│  │                                     ││
│  │ Max model size: ~32B (GPU only)     ││
│  │                 ~70B (with offload) ││
│  └─────────────────────────────────────┘│
│                                         │
│            [ Apply & Continue ]          │
└─────────────────────────────────────────┘
```

---

## Mode Expert

### Step 1: Hardware (read-only, detected)

```
┌─────────────────────────────────────────┐
│  Your Hardware                          │
│                                         │
│  GPU    RTX 3080      10 GB VRAM        │
│  RAM    32 GB         DDR4-3200         │
│  Disk   478 GB free   NVMe SSD          │
│  CPU    16 cores      AMD Ryzen 7       │
└─────────────────────────────────────────┘
```

### Step 2: Backend Selection

```
┌─────────────────────────────────────────┐
│  Inference Backends                     │
│                                         │
│  ☑ Ollama (recommended for <13B)        │
│    Simplest setup, auto GPU/CPU split   │
│    Best for: chat, code, small models   │
│                                         │
│  ☑ vLLM (recommended for >13B)          │
│    Advanced: AWQ, TurboQuant, speculate │
│    Best for: big models, high throughput│
│                                         │
│  ☐ LocalAI (classifiers, audio, image)  │
│    HuggingFace models, multi-modal      │
│    Best for: BERT, Whisper, SD, TTS     │
│                                         │
│  ☐ AirLLM (experimental, very slow)     │
│    Layer-wise: 70B on 4GB VRAM          │
│    Best for: no GPU / tiny VRAM         │
└─────────────────────────────────────────┘
```

### Step 3: Model Selection + Live Preview

```
┌─────────────────────────────────────────────────────────────┐
│  Select Default Model                                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Search models...                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ★ Llama 3.2 3B          Chat   2GB    Q4    Ollama   │  │
│  │   Llama 3.1 8B          Chat   4.5GB  Q4    Ollama   │  │
│  │   Qwen 2.5 32B          Chat   18GB   AWQ   vLLM     │  │
│  │ → Llama 3.3 70B         Chat   35GB   AWQ   vLLM     │  │
│  │   Qwen 2.5 72B          Chat   36GB   AWQ   vLLM     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── LIVE PERFORMANCE PREVIEW ──────────────────────────┐  │
│  │                                                       │  │
│  │  Model: Llama 3.3 70B (AWQ 4-bit)                    │  │
│  │                                                       │  │
│  │  VRAM Usage    ██████████░░░░░░░░░░  10/10 GB (100%)  │  │
│  │  RAM Offload   ████████████████░░░░  25/32 GB         │  │
│  │  Disk Usage    ██░░░░░░░░░░░░░░░░░░  35/478 GB        │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │ Estimated Speed                                │   │  │
│  │  │                                                │   │  │
│  │  │ Without speculative:    ~5 tokens/s            │   │  │
│  │  │ With speculative:       ~12 tokens/s  ⚡       │   │  │
│  │  │ Context window:         8K tokens              │   │  │
│  │  │ Time to first token:    ~2.5s                  │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  ⚠️ This model exceeds your VRAM. 25GB will be       │  │
│  │     offloaded to RAM (slower inference).               │  │
│  │     For best performance, use Qwen 2.5 32B instead.  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Step 4: Optimization Toggles

```
┌─────────────────────────────────────────────────────────────┐
│  Optimization Settings                                      │
│                                                             │
│  TurboQuant (KV Cache Compression)              [ON] ✅     │
│  └ 3-bit KV cache. 6x less VRAM for context.               │
│    Impact: 128K context uses 3GB instead of 18GB            │
│                                                             │
│  Speculative Decoding                           [ON] ✅     │
│  └ Draft model: Qwen3-0.6B (auto-selected)                 │
│    Impact: 2-3x faster generation                           │
│    Cost: +0.6GB VRAM for draft model                        │
│                                                             │
│  CPU Offload                                    [AUTO]      │
│  └ Automatically offload excess layers to RAM               │
│    Current: 25 GB offloaded                                 │
│                                                             │
│  Prefix Caching                                 [ON] ✅     │
│  └ Cache common prompt prefixes                             │
│    Impact: 2x faster for repeated system prompts            │
│                                                             │
│  ┌─── TOTAL RESOURCE USAGE ──────────────────────────────┐  │
│  │                                                       │  │
│  │  VRAM:   10.0 / 10.0 GB  ████████████████████ 100%   │  │
│  │  RAM:    25.6 / 32.0 GB  ████████████████░░░░  80%   │  │
│  │  Disk:   35.2 / 478 GB   ██░░░░░░░░░░░░░░░░░░  7%   │  │
│  │  Speed:  ~12 tok/s (with speculative decoding)        │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│         [ ← Back ]              [ Apply Configuration ]     │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints nécessaires

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `GET /api/system/hardware` | GET | Scan hardware (GPU, RAM, disk) |
| `GET /api/system/inference/status` | GET | État actuel de l'inference (backends actifs, modèles chargés) |
| `POST /api/system/inference/configure` | POST | Appliquer une config d'inference |
| `GET /api/system/inference/estimate` | GET | Estimer les perfs pour un modèle + config donnés |

## Données retournées par Hardware Scan

```json
{
  "gpu": {
    "name": "NVIDIA GeForce RTX 3080",
    "vramMB": 10240,
    "computeCapability": "8.6",
    "driverVersion": "570.86.16",
    "cudaVersion": "12.4"
  },
  "ram": {
    "totalMB": 32768,
    "availableMB": 24576,
    "type": "DDR4",
    "speed": "3200 MHz"
  },
  "cpu": {
    "name": "AMD Ryzen 7 5800X",
    "cores": 16,
    "threads": 32
  },
  "disk": {
    "freeGB": 478,
    "type": "nvme",
    "readSpeedMBs": 3500
  },
  "capabilities": {
    "canRunVllm": true,
    "canRunOllama": true,
    "canRunLocalAI": true,
    "maxModelSizeGB": 42,
    "recommendedBackend": "vllm",
    "recommendedQuantization": "awq"
  }
}
```

## Estimation de performance

```json
// GET /api/system/inference/estimate?model=llama-3.3-70b&quantization=awq&backend=vllm
{
  "model": "Llama 3.3 70B",
  "quantization": "AWQ 4-bit",
  "backend": "vllm",
  "resources": {
    "vramUsedMB": 10240,
    "vramPercent": 100,
    "ramOffloadMB": 25600,
    "ramPercent": 78,
    "diskUsageGB": 35,
    "diskPercent": 7
  },
  "performance": {
    "tokensPerSecond": 5,
    "tokensPerSecondWithSpeculative": 12,
    "timeToFirstTokenMs": 2500,
    "maxContextTokens": 8192,
    "maxContextWithTurboQuant": 32768
  },
  "optimizations": {
    "turboQuant": { "enabled": true, "impact": "6x less KV cache VRAM" },
    "speculativeDecoding": { "enabled": true, "draftModel": "Qwen3-0.6B", "speedup": "2.4x" },
    "cpuOffload": { "enabled": true, "offloadGB": 25, "impact": "slower but fits in memory" },
    "prefixCaching": { "enabled": true, "impact": "2x faster for repeated prompts" }
  },
  "warnings": [
    "Model exceeds VRAM — 25GB offloaded to RAM (slower inference)",
    "For best performance, consider Qwen 2.5 32B (fits in GPU)"
  ],
  "recommendation": "Consider Qwen 2.5 32B for 3x faster inference on your hardware"
}
```

## Implementation Priority

1. **Hardware detection API** — `/api/system/hardware` (nvidia-smi + /proc/meminfo)
2. **Performance estimator** — `/api/system/inference/estimate` (calcul local, pas besoin de charger)
3. **Setup wizard UI** — mode auto + expert dans le setup + settings
4. **Smart router middleware** — choisit le backend par requête
5. **Speculative decoding** — flag vLLM dans docker-compose
