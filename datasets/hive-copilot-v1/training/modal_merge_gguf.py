"""
Modal: Merge LoRA into base model and convert to GGUF for Ollama.

  pip install modal
  modal run datasets/hive-copilot-v1/training/modal_merge_gguf.py

Downloads the GGUF file to local after completion.
"""

from __future__ import annotations
from pathlib import Path

HIVE_COPILOT_BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
TRAIN_DIR = Path(__file__).resolve().parent
OUTPUT_VOLUME_NAME = "hive-copilot-lora-output"

try:
    import modal
except ImportError as e:
    raise SystemExit("Install modal: pip install modal") from e

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.1.0",
        "transformers>=4.40.0",
        "peft>=0.10.0",
        "accelerate>=0.27.0",
        "sentencepiece>=0.1.99",
        "protobuf>=4.0.0",
        "llama-cpp-python>=0.3.0",
        "gguf>=0.10.0",
    )
    .run_commands("pip install huggingface_hub[cli]")
)

lora_vol = modal.Volume.from_name(OUTPUT_VOLUME_NAME, create_if_missing=True)

app = modal.App("hive-copilot-merge-gguf")


@app.function(
    image=image,
    gpu="A10G",
    timeout=60 * 60,
    volumes={"/output": lora_vol},
    memory=32768,
)
def merge_and_convert(
    base_model: str = HIVE_COPILOT_BASE_MODEL,
    adapter_path: str = "/output/lora-hive-copilot",
    quantize: str = "q4_k_m",
) -> str:
    import subprocess
    import sys
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    merged_path = "/output/merged-full"
    gguf_path = "/output/hive-copilot.gguf"

    # Step 1: Load base + adapter on GPU
    print("Loading base model on GPU (float16)...", flush=True)
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        trust_remote_code=True,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)

    print(f"Loading LoRA adapter from {adapter_path}...", flush=True)
    model = PeftModel.from_pretrained(model, adapter_path)

    print("Merging LoRA into base model...", flush=True)
    model = model.merge_and_unload()

    print(f"Saving merged model to {merged_path}...", flush=True)
    model.save_pretrained(merged_path, safe_serialization=True)
    tokenizer.save_pretrained(merged_path)
    del model
    torch.cuda.empty_cache()
    print("Merged model saved.", flush=True)

    # Step 2: Convert to GGUF using llama.cpp
    print(f"Converting to GGUF ({quantize})...", flush=True)
    try:
        # Use huggingface_hub's gguf export
        cmd = [
            sys.executable, "-m", "llama_cpp.llama_convert",
            "--outfile", gguf_path,
            "--outtype", quantize,
            merged_path,
        ]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0:
            # Fallback: try convert_hf_to_gguf from llama-cpp-python
            print(f"llama_convert failed, trying alternative...", flush=True)
            # Install and use the convert script from llama.cpp
            subprocess.run([
                sys.executable, "-m", "pip", "install", "llama-cpp-python[convert]"
            ], capture_output=True)

            # Use transformers' built-in GGUF export
            from transformers import AutoModelForCausalLM as AMCL
            print("Reloading for GGUF export...", flush=True)
            m2 = AMCL.from_pretrained(merged_path, torch_dtype=torch.float16, device_map="cpu")
            m2.save_pretrained(merged_path, safe_serialization=False)  # Save as .bin for compat
            del m2

            # Use huggingface-cli to convert
            p2 = subprocess.run([
                sys.executable, "-m", "huggingface_hub", "gguf-convert",
                merged_path, gguf_path,
                "--quantize", quantize,
            ], capture_output=True, text=True)
            if p2.returncode != 0:
                print(f"GGUF convert failed: {p2.stderr}", flush=True)
                # Just save the merged HF model - user can convert locally
                lora_vol.commit()
                return f"Merged model saved to {merged_path} (GGUF conversion failed - convert locally with llama.cpp)"
    except Exception as e:
        print(f"GGUF conversion error: {e}", flush=True)
        lora_vol.commit()
        return f"Merged model saved to {merged_path} (GGUF conversion failed: {e})"

    lora_vol.commit()

    import os
    if os.path.exists(gguf_path):
        size_mb = os.path.getsize(gguf_path) / (1024 * 1024)
        return f"GGUF saved to {gguf_path} ({size_mb:.0f}MB). Download: modal volume get {OUTPUT_VOLUME_NAME} hive-copilot.gguf app/models/hive-copilot.gguf"
    else:
        return f"Merged HF model at {merged_path}. Convert to GGUF locally."


@app.local_entrypoint()
def main():
    print(merge_and_convert.remote())
