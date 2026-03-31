# Hive copilot LoRA (PEFT)

Adapter trained on `datasets/hive-copilot-v1/splits/combined-train.jsonl` (Modal: `hive-copilot-lora-output`).

## Fetch before `docker build`

From the `app/` directory (Modal CLI logged in):

```bash
npm run dataset:fetch-modal-lora
```

This downloads `lora-hive-copilot/` into this folder. The Docker image copies `app/models/hive-copilot-lora` into `/app/models/hive-copilot-lora`.

## Runtime

Set `HIVE_COPILOT_LORA_PATH=/app/models/hive-copilot-lora/lora-hive-copilot` (default in Compose) for tools that load the adapter with Qwen2.5-7B-Instruct.

Inference example (paths from repo root):

```bash
python datasets/hive-copilot-v1/training/run_golden_inference_lora.py --adapter app/models/hive-copilot-lora/lora-hive-copilot
```

The adapter directory must contain `adapter_model.safetensors` and tokenizer files next to it.
