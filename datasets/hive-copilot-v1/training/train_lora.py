#!/usr/bin/env python3
"""
LoRA / SFT on Hive copilot JSONL (messages + metadata).

  pip install -r datasets/hive-copilot-v1/training/requirements-train.txt
  python datasets/hive-copilot-v1/training/train_lora.py --max-steps 20 --max-samples 200

Default base model is the single Hive copilot target (see HIVE_COPILOT_BASE_MODEL).
Training 7B expects a CUDA GPU with enough VRAM (~16GB+ bf16); override --base-model only for experiments.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def repo_root() -> Path:
    """Hive repo root when running from checkout; else env HIVE_REPO_ROOT or cwd (e.g. Modal /root)."""
    p = Path(__file__).resolve()
    if p.name == "train_lora.py" and p.parent.name == "training":
        hive = p.parent.parent
        if hive.name == "hive-copilot-v1":
            return p.parents[3]
    env = os.environ.get("HIVE_REPO_ROOT")
    if env:
        return Path(env)
    return Path.cwd()


# Canonical base for Hive copilot LoRA (see manifest.json → training.model_selection).
HIVE_COPILOT_BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"


def load_jsonl_messages(path: Path, max_samples: int | None) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            msgs = rec.get("messages")
            if not isinstance(msgs, list) or len(msgs) < 2:
                continue
            rows.append({"messages": msgs})
            if max_samples is not None and len(rows) >= max_samples:
                break
    return rows


def messages_to_text(tokenizer, messages: list[dict]) -> str:
    if getattr(tokenizer, "chat_template", None):
        try:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
        except Exception:
            pass
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        parts.append(f"<|{role}|>\n{content}")
    return "\n".join(parts)


def run_training(
    data_path: Path,
    output_dir: Path,
    base_model: str,
    max_steps: int,
    max_samples: int | None,
    learning_rate: float,
    lora_r: int,
    seed: int,
    qlora: bool = False,
) -> str:
    import torch
    from datasets import Dataset
    from peft import LoraConfig, TaskType
    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
    from trl import SFTTrainer, SFTConfig

    rows = load_jsonl_messages(data_path, max_samples)
    if not rows:
        raise SystemExit(f"No usable rows in {data_path}")

    ds = Dataset.from_list(rows)

    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    def to_text(batch: dict) -> dict:
        texts = [messages_to_text(tokenizer, m) for m in batch["messages"]]
        return {"text": texts}

    ds = ds.map(to_text, batched=True, remove_columns=["messages"])

    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

    load_kwargs: dict = {
        "trust_remote_code": True,
        "device_map": "auto" if torch.cuda.is_available() else None,
    }

    if qlora and torch.cuda.is_available():
        from transformers import BitsAndBytesConfig
        load_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=dtype,
            bnb_4bit_use_double_quant=True,
        )
        print("QLoRA 4-bit enabled — VRAM usage ~6-8GB", flush=True)
    else:
        load_kwargs["dtype"] = dtype

    model = AutoModelForCausalLM.from_pretrained(base_model, **load_kwargs)
    if not torch.cuda.is_available():
        model = model.to("cpu")

    peft_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_r * 2,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )

    args = SFTConfig(
        output_dir=str(output_dir),
        max_steps=max_steps,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        warmup_ratio=0.03,
        logging_steps=5,
        save_steps=max(max_steps, 1),
        save_total_limit=2,
        seed=seed,
        bf16=torch.cuda.is_available(),
        fp16=False,
        report_to="none",
        dataset_text_field="text",
        packing=False,
        max_length=2048,
    )

    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=ds,
        processing_class=tokenizer,
        peft_config=peft_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    return f"saved LoRA adapter to {output_dir} ({len(ds)} samples, {max_steps} steps)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--data",
        type=Path,
        default=repo_root() / "datasets/hive-copilot-v1/splits/combined-train.jsonl",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=repo_root() / "datasets/hive-copilot-v1/training/outputs/lora-latest",
    )
    ap.add_argument(
        "--base-model",
        default=HIVE_COPILOT_BASE_MODEL,
        help=f"Default: {HIVE_COPILOT_BASE_MODEL} (Hive copilot standard). Override only for experiments.",
    )
    ap.add_argument(
        "--preset",
        choices=["smoke", "dev", "production", "local"],
        default=None,
        help="smoke=1 step 8 samples; dev=80 steps 4k samples; production=500 steps full data, lr 1.5e-4. Overrides other flags unless you omit --preset.",
    )
    ap.add_argument("--max-steps", type=int, default=30)
    ap.add_argument("--max-samples", type=int, default=None)
    ap.add_argument("--learning-rate", type=float, default=2e-4)
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--qlora", action="store_true", help="Enable 4-bit QLoRA (for GPUs with <16GB VRAM, e.g. RTX 3080)")
    args = ap.parse_args()

    PRESET = {
        "smoke": {"max_steps": 1, "max_samples": 8},
        "dev": {"max_steps": 80, "max_samples": 4000, "learning_rate": 2e-4, "lora_r": 16},
        "production": {"max_steps": 500, "max_samples": None, "learning_rate": 1.5e-4, "lora_r": 16},
        "local": {"max_steps": 600, "max_samples": 10000, "learning_rate": 2e-4, "lora_r": 16, "qlora": True},
    }
    if args.preset:
        for k, v in PRESET[args.preset].items():
            setattr(args, k, v)

    args.output.mkdir(parents=True, exist_ok=True)
    msg = run_training(
        data_path=args.data,
        output_dir=args.output,
        base_model=args.base_model,
        max_steps=args.max_steps,
        max_samples=args.max_samples,
        learning_rate=args.learning_rate,
        lora_r=args.lora_r,
        seed=args.seed,
        qlora=args.qlora,
    )
    print(msg, flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130) from None
