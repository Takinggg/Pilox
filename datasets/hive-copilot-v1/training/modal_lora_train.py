"""
Modal: LoRA / SFT using the same train_lora.py as local runs.

  pip install modal
  modal run datasets/hive-copilot-v1/training/modal_lora_train.py

Weights are persisted to a Modal Volume (see OUTPUT_VOLUME_NAME). After a successful run, fetch into the app image path:

  cd app && npm run dataset:fetch-modal-lora

Optional: modal secret create huggingface HF_TOKEN=... then add to the @app.function(secrets=[...]) call.

Base model matches train_lora.HIVE_COPILOT_BASE_MODEL (single Hive copilot target).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Must match datasets/hive-copilot-v1/training/train_lora.py
HIVE_COPILOT_BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"

TRAIN_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = TRAIN_DIR.parent / "splits/combined-train.jsonl"
TRAIN_SCRIPT = TRAIN_DIR / "train_lora.py"

# Persistent store for adapter + tokenizer (survives after the GPU container exits)
OUTPUT_VOLUME_NAME = "hive-copilot-lora-output"

try:
    import modal
except ImportError as e:
    raise SystemExit("Install modal: pip install modal") from e

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(str(TRAIN_DIR / "requirements-train.txt"))
    .add_local_file(str(TRAIN_SCRIPT), "/root/train_lora.py")
    .add_local_file(str(DEFAULT_DATA), "/data/combined-train.jsonl")
)

lora_output_vol = modal.Volume.from_name(OUTPUT_VOLUME_NAME, create_if_missing=True)

app = modal.App("hive-copilot-lora")


@app.function(
    image=image,
    gpu="L4",
    timeout=60 * 60 * 24,
    volumes={"/output": lora_output_vol},
)
def train_modal(
    base_model: str = HIVE_COPILOT_BASE_MODEL,
    max_steps: int = 200,
    max_samples: int | None = 4000,
    output_dir: str = "/output/lora-hive-copilot",
) -> str:
    cmd = [
        sys.executable,
        "/root/train_lora.py",
        "--data",
        "/data/combined-train.jsonl",
        "--output",
        output_dir,
        "--base-model",
        base_model,
        "--max-steps",
        str(max_steps),
    ]
    if max_samples is not None:
        cmd += ["--max-samples", str(max_samples)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        return f"FAILED {p.returncode}\n{p.stderr}\n{p.stdout}"
    lora_output_vol.commit()
    tail = (
        f"\n\nCommitted adapter to Modal volume {OUTPUT_VOLUME_NAME!r} at {output_dir!r}.\n"
        f"Download for Docker: cd app && npm run dataset:fetch-modal-lora\n"
    )
    return (p.stdout or "ok") + tail


@app.local_entrypoint()
def main(
    base_model: str = HIVE_COPILOT_BASE_MODEL,
    max_steps: int = 200,
    max_samples: int = 4000,
):
    print(train_modal.remote(base_model=base_model, max_steps=max_steps, max_samples=max_samples))
