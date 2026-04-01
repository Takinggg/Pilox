"""
Modal: Convert merged HF model to GGUF for Ollama.

  modal run datasets/hive-copilot-v1/training/modal_convert_gguf.py
"""

from __future__ import annotations

try:
    import modal
except ImportError as e:
    raise SystemExit("Install modal: pip install modal") from e

OUTPUT_VOLUME_NAME = "hive-copilot-lora-output"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "cmake", "build-essential")
    .run_commands(
        "pip install torch transformers==4.44.2 sentencepiece protobuf",
        "git clone --depth 1 https://github.com/ggerganov/llama.cpp /llama.cpp",
        "pip install -r /llama.cpp/requirements/requirements-convert_hf_to_gguf.txt || true",
        "pip install gguf",
    )
)

lora_vol = modal.Volume.from_name(OUTPUT_VOLUME_NAME, create_if_missing=True)
app = modal.App("hive-copilot-to-gguf")


@app.function(
    image=image,
    gpu="A10G",
    timeout=60 * 60,
    volumes={"/output": lora_vol},
    memory=32768,
)
def convert_to_gguf() -> str:
    import subprocess
    import os
    import json
    import shutil

    merged_path = "/output/merged-full"
    gguf_path = "/output/hive-copilot-q4_k_m.gguf"

    if not os.path.exists(f"{merged_path}/config.json"):
        return f"ERROR: Merged model not found at {merged_path}"

    # Fix: Qwen2.5 tokenizer has extra_special_tokens as list, convert to dict
    tk_path = f"{merged_path}/tokenizer_config.json"
    if os.path.exists(tk_path):
        with open(tk_path, "r") as f:
            tk = json.load(f)
        if "extra_special_tokens" in tk and isinstance(tk["extra_special_tokens"], list):
            print("Fixing extra_special_tokens (list -> removing)...", flush=True)
            del tk["extra_special_tokens"]
            with open(tk_path, "w") as f:
                json.dump(tk, f, indent=2)

    print("Converting HF model to GGUF (f16)...", flush=True)

    f16_path = "/output/hive-copilot-f16.gguf"
    p = subprocess.run([
        "python", "/llama.cpp/convert_hf_to_gguf.py",
        merged_path,
        "--outfile", f16_path,
        "--outtype", "f16",
    ], capture_output=True, text=True)

    if p.returncode != 0:
        return f"Convert failed: {p.stderr[-1000:]}"

    print(f"f16 GGUF created: {os.path.getsize(f16_path) / 1024**3:.1f}GB", flush=True)

    # Build llama-quantize
    print("Building llama-quantize...", flush=True)
    subprocess.run(["cmake", "-B", "/llama.cpp/build", "-S", "/llama.cpp", "-DCMAKE_BUILD_TYPE=Release"], capture_output=True)
    subprocess.run(["cmake", "--build", "/llama.cpp/build", "--target", "llama-quantize", "-j4"], capture_output=True)

    # Find quantize binary
    quantize_bin = None
    for candidate in ["/llama.cpp/build/bin/llama-quantize", "/llama.cpp/build/llama-quantize"]:
        if os.path.exists(candidate):
            quantize_bin = candidate
            break

    if quantize_bin:
        print("Quantizing to q4_k_m...", flush=True)
        p2 = subprocess.run([quantize_bin, f16_path, gguf_path, "q4_k_m"], capture_output=True, text=True)
        if p2.returncode != 0:
            print(f"Quantize stderr: {p2.stderr[-500:]}", flush=True)
            gguf_path = f16_path
        else:
            os.remove(f16_path)
    else:
        print("llama-quantize not built, keeping f16", flush=True)
        gguf_path = f16_path

    lora_vol.commit()

    size_mb = os.path.getsize(gguf_path) / (1024 * 1024)
    filename = os.path.basename(gguf_path)
    return f"Done! {filename} ({size_mb:.0f}MB)\nDownload: modal volume get {OUTPUT_VOLUME_NAME} {filename} app/models/{filename}"


@app.local_entrypoint()
def main():
    print(convert_to_gguf.remote())
