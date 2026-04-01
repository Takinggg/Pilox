"""
Modal: run golden inference with trained LoRA adapter on GPU.

  pip install modal
  modal run datasets/hive-copilot-v1/training/modal_golden_inference.py

Results are printed as JSON and saved to the Modal volume.
Download predictions then eval locally:

  modal volume get hive-copilot-lora-output golden-inference-predictions.jsonl datasets/hive-copilot-v1/reports/golden-inference-predictions.jsonl
  cd app && node scripts/eval-copilot-quality.mjs --file ../datasets/hive-copilot-v1/reports/golden-inference-predictions.jsonl
"""

from __future__ import annotations

from pathlib import Path

HIVE_COPILOT_BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
TRAIN_DIR = Path(__file__).resolve().parent
GOLDEN_EVAL = TRAIN_DIR.parent / "splits" / "golden-eval.jsonl"
INFERENCE_SCRIPT = TRAIN_DIR / "run_golden_inference_lora.py"
OUTPUT_VOLUME_NAME = "hive-copilot-lora-output"

try:
    import modal
except ImportError as e:
    raise SystemExit("Install modal: pip install modal") from e

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(str(TRAIN_DIR / "requirements-train.txt"))
    .add_local_file(str(INFERENCE_SCRIPT), "/root/run_golden_inference_lora.py")
    .add_local_file(str(GOLDEN_EVAL), "/data/golden-eval.jsonl")
)

lora_output_vol = modal.Volume.from_name(OUTPUT_VOLUME_NAME, create_if_missing=True)

app = modal.App("hive-copilot-golden-inference")


@app.function(
    image=image,
    gpu="A10G",
    timeout=60 * 60,
    volumes={"/output": lora_output_vol},
)
def run_inference(
    base_model: str = HIVE_COPILOT_BASE_MODEL,
    adapter_path: str = "/output/lora-hive-copilot",
    max_samples: int | None = None,
) -> str:
    import subprocess
    import sys

    cmd = [
        sys.executable,
        "/root/run_golden_inference_lora.py",
        "--golden", "/data/golden-eval.jsonl",
        "--output", "/output/golden-inference-predictions.jsonl",
        "--base-model", base_model,
        "--adapter", adapter_path,
    ]
    if max_samples is not None:
        cmd += ["--max-samples", str(max_samples)]

    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        return f"FAILED {p.returncode}\n{p.stderr}\n{p.stdout}"

    lora_output_vol.commit()

    result = p.stdout or "ok"
    result += (
        f"\n\nPredictions saved to Modal volume {OUTPUT_VOLUME_NAME!r}."
        f"\nDownload: modal volume get {OUTPUT_VOLUME_NAME} golden-inference-predictions.jsonl "
        f"datasets/hive-copilot-v1/reports/golden-inference-predictions.jsonl"
        f"\nEval: cd app && node scripts/eval-copilot-quality.mjs "
        f"--file ../datasets/hive-copilot-v1/reports/golden-inference-predictions.jsonl"
    )
    return result


@app.local_entrypoint()
def main(
    base_model: str = HIVE_COPILOT_BASE_MODEL,
    adapter_path: str = "/output/lora-hive-copilot",
    max_samples: int | None = None,
):
    print(run_inference.remote(
        base_model=base_model,
        adapter_path=adapter_path,
        max_samples=max_samples,
    ))
