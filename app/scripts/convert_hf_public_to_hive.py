#!/usr/bin/env python3
"""
Convert local HF snapshots under datasets/hive-copilot-v1/external/hf/ into Hive copilot JSONL lines
(messages + metadata).

BFCL (gorilla-llm/Berkeley-Function-Calling-Leaderboard): reads top-level BFCL_v3_*.json
(JSONL: one JSON object per line). Optional legacy parquet rows if present.
Spider (xlangai/spider): reads *.parquet under the snapshot (e.g. spider/train-*.parquet).
Optional *.jsonl if present.

Requires pandas + pyarrow for parquet.

Usage (from repo root or app/):
  python app/scripts/convert_hf_public_to_hive.py
  python app/scripts/convert_hf_public_to_hive.py --max-per-source 500

Output: datasets/hive-copilot-v1/splits/public-sources-train.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    pd = None  # type: ignore


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


SYSTEM = (
    "You are the Hive canvas copilot. Propose agent graphs using only Hive runtime images listed in context. "
    "Ask concise clarifying questions when credentials or data scope are unknown."
)


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def dedupe_records(records: list[dict]) -> tuple[list[dict], int]:
    """Drop exact-duplicate JSON rows (same question can appear in multiple BFCL shards)."""
    seen: set[str] = set()
    out: list[dict] = []
    for r in records:
        key = json.dumps(r, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out, len(records) - len(out)


def iter_parquet_files(root: Path) -> list[Path]:
    return [p for p in root.rglob("*.parquet") if ".cache" not in p.parts]


def extract_bfcl_user_question(q_field: object) -> str:
    """Flatten BFCL `question` field (nested lists of {role, content}) to one string."""
    parts: list[str] = []
    if isinstance(q_field, str):
        t = q_field.strip()
        return t if len(t) >= 4 else ""
    if not isinstance(q_field, list):
        return ""
    for turn in q_field:
        if isinstance(turn, list):
            for msg in turn:
                if isinstance(msg, dict) and msg.get("role") == "user":
                    c = msg.get("content")
                    if isinstance(c, str) and c.strip():
                        parts.append(c.strip())
        elif isinstance(turn, dict) and turn.get("role") == "user":
            c = turn.get("content")
            if isinstance(c, str) and c.strip():
                parts.append(c.strip())
    return " ".join(parts) if parts else ""


def bfcl_function_blob(rec: dict) -> str:
    fn = rec.get("function")
    if fn is not None:
        if isinstance(fn, str):
            return fn[:6000]
        return json.dumps(fn, ensure_ascii=False)[:6000]
    if rec.get("path"):
        return json.dumps({"path": rec["path"]}, ensure_ascii=False)[:6000]
    return ""


def bfcl_assistant_reply() -> str:
    return (
        "Suggested Hive pipeline:\n"
        "1. hive/http-input:latest — ingress.\n"
        "2. hive/llm-agent:latest — plan tool calls with function schemas.\n"
        "3. hive/tool-agent:latest — execute external APIs.\n"
        "4. hive/output-parser:latest — validate structured outputs if needed.\n"
        "5. hive/http-output:latest — respond.\n"
        "Store credentials in Hive secrets; never embed secrets in the graph."
    )


def bfcl_record_from_parsed(rec: dict) -> dict | None:
    q = extract_bfcl_user_question(rec.get("question"))
    if len(q) < 4:
        return None
    fn = bfcl_function_blob(rec)
    user = f"[BFCL] {q}\n\nTools/context (truncated):\n{fn}"
    return {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
            {"role": "assistant", "content": bfcl_assistant_reply()},
        ],
        "metadata": {
            "source": "public_bfcl",
            "locale": "en",
            "hive_runtime_images": [
                "hive/http-input:latest",
                "hive/llm-agent:latest",
                "hive/tool-agent:latest",
                "hive/output-parser:latest",
                "hive/http-output:latest",
            ],
            "synthetic": True,
            "public_derived": True,
        },
    }


def bfcl_from_hf_json_lines(bfcl_dir: Path, max_n: int) -> list[dict]:
    """HF BFCL snapshot ships BFCL_v3_*.json as JSONL (one JSON object per line)."""
    out: list[dict] = []
    json_files = sorted(bfcl_dir.glob("BFCL_v3_*.json"))
    for jf in json_files:
        if len(out) >= max_n:
            break
        try:
            with jf.open(encoding="utf-8", errors="replace") as f:
                for line in f:
                    if len(out) >= max_n:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(rec, dict):
                        continue
                    row = bfcl_record_from_parsed(rec)
                    if row is not None:
                        out.append(row)
        except OSError as e:
            print(f"  skip bfcl file {jf}: {e}", file=sys.stderr)
    return out


def bfcl_from_parquet(files: list[Path], max_n: int) -> list[dict]:
    if not files or pd is None:
        return []
    out: list[dict] = []
    for fp in files:
        try:
            df = pd.read_parquet(fp)
        except Exception as e:
            print(f"  skip parquet {fp}: {e}", file=sys.stderr)
            continue
        cols = {c.lower(): c for c in df.columns}
        qcol = cols.get("question") or cols.get("question_text")
        if not qcol:
            continue
        for _, row in df.iterrows():
            if len(out) >= max_n:
                return out
            q = row.get(qcol) or ""
            if not isinstance(q, str) or len(q.strip()) < 4:
                continue
            fn = row.get("function") or row.get("functions") or row.get("function_call")
            if fn is not None and not isinstance(fn, str):
                fn = json.dumps(fn, ensure_ascii=False)[:6000]
            elif isinstance(fn, str):
                fn = fn[:6000]
            else:
                fn = ""
            user = f"[BFCL] {q}\n\nTools/context (truncated):\n{fn}"
            out.append(
                {
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": user},
                        {"role": "assistant", "content": bfcl_assistant_reply()},
                    ],
                    "metadata": {
                        "source": "public_bfcl",
                        "locale": "en",
                        "hive_runtime_images": [
                            "hive/http-input:latest",
                            "hive/llm-agent:latest",
                            "hive/tool-agent:latest",
                            "hive/output-parser:latest",
                            "hive/http-output:latest",
                        ],
                        "synthetic": True,
                        "public_derived": True,
                    },
                }
            )
    return out


def spider_from_parquet_files(files: list[Path], max_n: int) -> list[dict]:
    if not files or pd is None:
        return []
    out: list[dict] = []
    assistant = (
        "Suggested Hive pipeline for text-to-SQL:\n"
        "1. hive/http-input:latest — receive user question.\n"
        "2. hive/db-connector:latest — run parameterized SQL (read-only role).\n"
        "3. hive/llm-agent:latest — explain results or format answer.\n"
        "4. hive/http-output:latest — return response.\n"
        "Never concatenate raw user text into SQL; use bindings."
    )
    for fp in files:
        if len(out) >= max_n:
            break
        try:
            df = pd.read_parquet(fp)
        except Exception as e:
            print(f"  skip spider parquet {fp}: {e}", file=sys.stderr)
            continue
        cols = {c.lower(): c for c in df.columns}
        qcol = cols.get("question")
        if not qcol:
            continue
        for _, row in df.iterrows():
            if len(out) >= max_n:
                return out
            q = row.get(qcol) or ""
            if not isinstance(q, str) or len(q.strip()) < 4:
                continue
            out.append(
                {
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": f"[Spider] {q}"},
                        {"role": "assistant", "content": assistant},
                    ],
                    "metadata": {
                        "source": "public_spider",
                        "locale": "en",
                        "hive_runtime_images": [
                            "hive/http-input:latest",
                            "hive/db-connector:latest",
                            "hive/llm-agent:latest",
                            "hive/http-output:latest",
                        ],
                        "synthetic": True,
                        "public_derived": True,
                    },
                }
            )
    return out


def spider_from_jsonl(root: Path, max_n: int) -> list[dict]:
    out: list[dict] = []
    for fp in root.rglob("*.jsonl"):
        if ".cache" in fp.parts:
            continue
        try:
            with fp.open(encoding="utf-8", errors="replace") as f:
                for line in f:
                    if len(out) >= max_n:
                        return out
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    q = rec.get("question") or rec.get("utterance")
                    if not isinstance(q, str):
                        continue
                    assistant = (
                        "Suggested Hive pipeline for text-to-SQL:\n"
                        "1. hive/http-input:latest — receive user question.\n"
                        "2. hive/db-connector:latest — run parameterized SQL (read-only role).\n"
                        "3. hive/llm-agent:latest — explain results or format answer.\n"
                        "4. hive/http-output:latest — return response.\n"
                        "Never concatenate raw user text into SQL; use bindings."
                    )
                    out.append(
                        {
                            "messages": [
                                {"role": "system", "content": SYSTEM},
                                {"role": "user", "content": f"[Spider] {q}"},
                                {"role": "assistant", "content": assistant},
                            ],
                            "metadata": {
                                "source": "public_spider",
                                "locale": "en",
                                "hive_runtime_images": [
                                    "hive/http-input:latest",
                                    "hive/db-connector:latest",
                                    "hive/llm-agent:latest",
                                    "hive/http-output:latest",
                                ],
                                "synthetic": True,
                                "public_derived": True,
                            },
                        }
                    )
        except OSError:
            continue
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-source", type=int, default=2000)
    args = ap.parse_args()
    max_n = max(1, args.max_per_source)

    root = repo_root()
    hf = root / "datasets/hive-copilot-v1/external/hf"
    out_path = root / "datasets/hive-copilot-v1/splits/public-sources-train.jsonl"

    if not hf.is_dir():
        print(f"No HF dir: {hf}", file=sys.stderr)
        write_jsonl(out_path, [])
        return 0

    records: list[dict] = []

    bfcl_dir = hf / "gorilla-llm__Berkeley-Function-Calling-Leaderboard"
    if bfcl_dir.is_dir():
        bfcl_rows = bfcl_from_hf_json_lines(bfcl_dir, max_n)
        print(f"BFCL HF JSON lines: {len(bfcl_rows)}", flush=True)
        if len(bfcl_rows) < max_n and pd is not None:
            pq = iter_parquet_files(bfcl_dir)
            print(f"BFCL parquet files (top-up): {len(pq)}", flush=True)
            bfcl_rows.extend(bfcl_from_parquet(pq, max_n - len(bfcl_rows)))
        records.extend(bfcl_rows)

    spider_dir = hf / "xlangai__spider"
    if spider_dir.is_dir():
        pq = iter_parquet_files(spider_dir)
        print(f"Spider parquet files: {len(pq)}", flush=True)
        spider_rows = spider_from_parquet_files(pq, max_n)
        if len(spider_rows) == 0:
            spider_rows = spider_from_jsonl(spider_dir, max_n)
        print(f"Spider rows: {len(spider_rows)}", flush=True)
        records.extend(spider_rows)

    before = len(records)
    records, dropped = dedupe_records(records)
    if dropped:
        print(f"Deduped {dropped} duplicate public rows ({before} -> {len(records)})", flush=True)

    write_jsonl(out_path, records)
    print(f"Wrote {len(records)} lines -> {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
