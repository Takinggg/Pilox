# VPTQ + TurboQuant: Run 70B Models on Consumer GPUs

Pilox integrates **VPTQ** (Microsoft) and **TurboQuant** (Google, ICLR 2026) to run large language models on hardware that was previously impossible.

## The Problem

A 70B parameter model requires ~140GB in FP16 — far beyond any consumer GPU. Even Q4 quantization needs ~35GB. This forces teams to either pay for cloud A100s or settle for smaller, less capable models.

## The Solution: Dual Compression

| Technology | What it compresses | Compression | Source |
|---|---|---|---|
| **VPTQ** | Model weights | 6.5x (2-bit) | Microsoft Research |
| **TurboQuant** | KV cache (runtime) | 6x (3-bit) | Google (ICLR 2026) |

Combined effect on a 70B model:

| Component | FP16 | Q4 | VPTQ 2-bit + TurboQuant |
|---|---|---|---|
| Weights | 140GB | 35GB | **~18GB** |
| KV cache (32K ctx) | 17GB | 17GB | **~2.7GB** |
| **Total** | **157GB** | **52GB** | **~21GB** |

An RTX 3080 (10GB) + 32GB system RAM can run a 70B model with GPU offloading.

## How It Works in Pilox

### Architecture

```
User clicks "Pull" on 70B model
  |
  v
Models API detects VPTQ variant on HuggingFace
  |  (e.g. VPTQ-community/Llama-3.1-70B-VPTQ-2bit)
  v
vLLM loads model with --quantization vptq --cpu-offload-gb auto
  |
  v
TurboQuant compresses KV cache at runtime (3-bit)
  |
  v
Agent workflow calls vLLM -> inference on 10GB GPU + RAM offload
```

### Supported Models (pre-quantized on HuggingFace)

| Model | VPTQ Variant | VRAM (2-bit) |
|---|---|---|
| Llama 3.1 70B Instruct | `VPTQ-community/Meta-Llama-3.1-70B-Instruct-v16-k65536-65536-woft` | ~18GB |
| Qwen 2.5 72B Instruct | `VPTQ-community/Qwen2.5-72B-Instruct-v16-k65536-65536-woft` | ~19GB |
| Mistral Large | `VPTQ-community/Mistral-Large-Instruct-2407-v16-k65536-65536-woft` | ~16GB |
| Llama 3.1 8B Instruct | `VPTQ-community/Meta-Llama-3.1-8B-Instruct-v8-k65536-65536-woft` | ~2.5GB |

### VRAM Calculator

The Models page includes a real-time VRAM calculator:

- **Green**: Model fits entirely in GPU VRAM
- **Yellow**: Model fits with CPU RAM offload (slower but functional)
- **Red**: Insufficient total memory

### Configuration

Environment variables in `docker-compose.local.yml`:

```yaml
vllm:
  environment:
    VLLM_QUANTIZATION: auto          # Detects VPTQ automatically
    VLLM_CPU_OFFLOAD_GB: auto        # Auto-detect from available RAM
    VLLM_ENABLE_PREFIX_CACHING: true  # Long-context efficiency
    VLLM_KV_CACHE_DTYPE: turboquant  # TurboQuant 3-bit KV cache
```

### Performance Expectations

On an RTX 3080 (10GB VRAM) with 32GB RAM:

| Model | Tokens/sec | First token | Quality vs FP16 |
|---|---|---|---|
| 8B VPTQ 2-bit | ~30 t/s | ~1s | ~98% |
| 70B VPTQ 2-bit (offload) | ~5-8 t/s | ~3-5s | ~95% |
| 70B Q4 (no VPTQ) | Would not fit | - | - |

### Canvas Copilot

The built-in Canvas Copilot can use any loaded model. With a 70B model via VPTQ:
- Better JSON format compliance
- More accurate node suggestions
- Deeper reasoning about workflow architecture

Enable in **Settings > LLM Providers > Canvas Copilot** or during the setup wizard.

## Why This Matters

No other self-hosted agent platform offers 70B inference on consumer hardware. This means:

1. **Privacy**: Enterprise data never leaves your infrastructure
2. **Cost**: No cloud GPU bills ($2-8/hr for A100)
3. **Latency**: Local inference, no network round-trips
4. **Autonomy**: No vendor lock-in, no API rate limits

## References

- [VPTQ: Extreme Low-bit Vector Post-Training Quantization](https://github.com/microsoft/VPTQ) (Microsoft)
- [TurboQuant: Redefining AI efficiency with extreme compression](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/) (Google, ICLR 2026)
- [TurboQuant llama.cpp integration](https://github.com/ggml-org/llama.cpp/discussions/20969)
