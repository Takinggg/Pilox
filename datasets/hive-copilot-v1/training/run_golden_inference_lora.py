#!/usr/bin/env python3
"""
Run Qwen base (+ optional PEFT adapter) on golden-eval prompts; write JSONL for eval-copilot-quality.mjs.

  pip install -r datasets/hive-copilot-v1/training/requirements-train.txt
  python datasets/hive-copilot-v1/training/run_golden_inference_lora.py --adapter path/to/lora-latest
  python datasets/hive-copilot-v1/training/run_golden_inference_lora.py --base-only --max-samples 5

Compare base vs LoRA:
  python ... --base-only --output reports/pred-base.jsonl
  python ... --adapter training/outputs/lora-latest --output reports/pred-lora.jsonl
  cd app && node scripts/eval-copilot-quality.mjs --file ../datasets/hive-copilot-v1/reports/pred-lora.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def repo_root() -> Path:
    try:
        return Path(__file__).resolve().parents[3]
    except IndexError:
        return Path.cwd()


def load_golden(path: Path, max_samples: int | None) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
            if max_samples is not None and len(rows) >= max_samples:
                break
    return rows


def context_messages(record: dict) -> list[dict]:
    """Strip trailing assistant so the model can generate it."""
    msgs = record.get("messages")
    if not isinstance(msgs, list):
        return []
    if msgs and msgs[-1].get("role") == "assistant":
        return msgs[:-1]
    return msgs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--golden",
        type=Path,
        default=repo_root() / "datasets/hive-copilot-v1/splits/golden-eval.jsonl",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=repo_root() / "datasets/hive-copilot-v1/reports/golden-inference-predictions.jsonl",
    )
    ap.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--adapter", type=Path, default=None, help="PEFT adapter dir (from train_lora.py save)")
    ap.add_argument("--base-only", action="store_true", help="Do not load LoRA adapter")
    ap.add_argument("--max-samples", type=int, default=None)
    ap.add_argument("--max-new-tokens", type=int, default=1024)
    ap.add_argument("--qlora", action="store_true", help="Load base model in 4-bit (for GPUs with <16GB VRAM)")
    args = ap.parse_args()

    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as e:
        print("Install: pip install -r datasets/hive-copilot-v1/training/requirements-train.txt", file=sys.stderr)
        raise SystemExit(1) from e

    rows = load_golden(args.golden, args.max_samples)
    if not rows:
        raise SystemExit(f"No rows in {args.golden}")

    if not args.base_only and args.adapter is None:
        raise SystemExit("Provide --adapter PATH to LoRA output or use --base-only.")

    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    load_kwargs = {
        "trust_remote_code": True,
        "device_map": "auto" if torch.cuda.is_available() else None,
    }

    if args.qlora and torch.cuda.is_available():
        from transformers import BitsAndBytesConfig
        load_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=dtype,
            bnb_4bit_use_double_quant=True,
        )
        print("QLoRA 4-bit inference enabled", flush=True)
    else:
        load_kwargs["dtype"] = dtype

    model = AutoModelForCausalLM.from_pretrained(args.base_model, **load_kwargs)
    if not torch.cuda.is_available():
        model = model.to("cpu")

    if not args.base_only and args.adapter is not None:
        if not args.adapter.is_dir():
            raise SystemExit(f"Adapter dir not found: {args.adapter}")
        model = PeftModel.from_pretrained(model, str(args.adapter))

    out_lines: list[dict] = []
    for rec in rows:
        ctx = context_messages(rec)
        if not ctx:
            continue
        if not getattr(tokenizer, "chat_template", None):
            raise SystemExit("Tokenizer has no chat_template")
        prompt = tokenizer.apply_chat_template(
            ctx,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = tokenizer(prompt, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.to(model.device) for k, v in inputs.items()}
        with torch.no_grad():
            out_ids = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
            )
        gen = out_ids[0][inputs["input_ids"].shape[1] :]
        text = tokenizer.decode(gen, skip_special_tokens=True).strip()

        new_rec = json.loads(json.dumps(rec))
        new_msgs = list(new_rec.get("messages", []))
        if new_msgs and new_msgs[-1].get("role") == "assistant":
            new_msgs[-1] = {"role": "assistant", "content": text}
        else:
            new_msgs.append({"role": "assistant", "content": text})
        new_rec["messages"] = new_msgs
        if isinstance(new_rec.get("metadata"), dict):
            new_rec["metadata"] = dict(new_rec["metadata"])
            new_rec["metadata"]["inference"] = {
                "base_model": args.base_model,
                "adapter": str(args.adapter) if args.adapter else None,
            }
        out_lines.append(new_rec)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for r in out_lines:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(
        json.dumps(
            {
                "wrote": len(out_lines),
                "output": str(args.output),
                "next": f"cd app && node scripts/eval-copilot-quality.mjs --file {args.output.as_posix()}",
            },
            indent=2,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
