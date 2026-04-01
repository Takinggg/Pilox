#!/usr/bin/env python3
"""
Merge LoRA adapter into base model and export as GGUF for Ollama.

Usage:
  pip install transformers peft torch llama-cpp-python
  python scripts/merge-lora-to-gguf.py

Then:
  ollama create hive-copilot -f models/pilox-copilot-lora/Modelfile
"""

import argparse
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--adapter", default="app/models/pilox-copilot-lora")
    ap.add_argument("--output", default="app/models/pilox-copilot-merged")
    ap.add_argument("--quantize", default="q4_k_m", help="GGUF quantization (q4_k_m, q8_0, f16)")
    args = ap.parse_args()

    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as e:
        print(f"Install: pip install transformers peft torch", file=sys.stderr)
        raise SystemExit(1) from e

    print(f"Loading base model: {args.base_model}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)

    # Load in float16 for merging
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        trust_remote_code=True,
        torch_dtype=torch.float16,
        device_map="cpu",  # merge on CPU to avoid OOM
    )

    print(f"Loading LoRA adapter: {args.adapter}", flush=True)
    model = PeftModel.from_pretrained(model, args.adapter)

    print("Merging LoRA into base model...", flush=True)
    model = model.merge_and_unload()

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Saving merged model to: {output_path}", flush=True)
    model.save_pretrained(str(output_path))
    tokenizer.save_pretrained(str(output_path))

    print(f"Merged model saved to {output_path}", flush=True)
    print(f"\nNext steps:", flush=True)
    print(f"  1. Convert to GGUF: python -m llama_cpp.convert_hf {output_path} --outfile {output_path}/model.gguf --outtype {args.quantize}", flush=True)
    print(f"  2. Create Ollama model: ollama create hive-copilot -f {args.adapter}/Modelfile", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
