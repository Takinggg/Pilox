#!/usr/bin/env python3
"""
Download Hugging Face dataset repos listed in datasets/hive-copilot-v1/external/hf-repos.json
using snapshot_download (full repo snapshot, resumable).

Usage:
  python scripts/download-public-datasets.py
  python scripts/download-public-datasets.py --dry-run
  python scripts/download-public-datasets.py --only gorilla-llm/APIBench,microsoft/Spider
  python scripts/download-public-datasets.py --repo Adorg/ToolBench
  python scripts/download-public-datasets.py --skip bigscience/xP3,MBZUAI/Bactrian-X

PowerShell: utiliser --repo ou des guillemets autour de --only \"org/name\" (sinon / casse l'argument).

Env:
  HF_TOKEN  — requis pour certains dépôts gated (ex. BeaverTails) ; augmente aussi les quotas HF.
  HF_SNAPSHOT_MAX_WORKERS — workers snapshot_download (defaut 1 ; plus = plus de risque 429 resolver).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

try:
    from huggingface_hub import snapshot_download
except ImportError:
    print("Install: python -m pip install -r scripts/requirements-datasets.txt", file=sys.stderr)
    raise

try:
    from huggingface_hub.errors import HfHubHTTPError
except ImportError:
    from huggingface_hub.utils import HfHubHTTPError

try:
    from requests import HTTPError as RequestsHTTPError
except ImportError:
    RequestsHTTPError = None  # type: ignore[misc, assignment]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _is_hf_429(exc: BaseException) -> bool:
    """Detect 429 even when hf_hub wraps it (e.g. LocalEntryNotFoundError)."""
    cur: BaseException | None = exc
    seen: set[int] = set()
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, HfHubHTTPError):
            resp = getattr(cur, "response", None)
            if resp is not None and getattr(resp, "status_code", None) == 429:
                return True
        if RequestsHTTPError is not None and isinstance(cur, RequestsHTTPError):
            resp = getattr(cur, "response", None)
            if resp is not None and getattr(resp, "status_code", None) == 429:
                return True
        text = str(cur).lower()
        if "429" in str(cur) and ("too many" in text or "rate limit" in text or "quota" in text):
            return True
        nxt = cur.__cause__
        if nxt is None:
            nxt = cur.__context__
        cur = nxt
    return False


def _retry_after_seconds(exc: BaseException) -> float | None:
    """Honor Retry-After from any wrapped Hub/requests response."""
    cur: BaseException | None = exc
    seen: set[int] = set()
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        for attr in ("response",):
            resp = getattr(cur, attr, None)
            if resp is None:
                continue
            headers = getattr(resp, "headers", None)
            if headers is None:
                continue
            ra = headers.get("Retry-After") or headers.get("retry-after")
            if ra:
                try:
                    return float(ra)
                except ValueError:
                    pass
        nxt = cur.__cause__
        if nxt is None:
            nxt = cur.__context__
        cur = nxt
    return None


def _hf_token() -> bool | str | None:
    """HF_TOKEN env if set; else True so huggingface_hub uses cached `huggingface-cli login`."""
    t = os.environ.get("HF_TOKEN", "").strip()
    if t:
        return t
    return True


def _snapshot_max_workers() -> int:
    raw = os.environ.get("HF_SNAPSHOT_MAX_WORKERS", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    return 1


def _sleep_after_429(exc: BaseException, default_sec: float) -> float:
    ra = _retry_after_seconds(exc)
    if ra is not None and ra > 0:
        return min(ra, 3600.0)
    return default_sec


def _snapshot_with_429_retries(rid: str, dest: Path, max_attempts: int = 48) -> None:
    """snapshot_download with 429 backoff; local_dir is resumable."""
    delay_sec = 120.0
    workers = _snapshot_max_workers()
    token = _hf_token()
    for attempt in range(1, max_attempts + 1):
        try:
            snapshot_download(
                repo_id=rid,
                repo_type="dataset",
                local_dir=str(dest),
                max_workers=workers,
                token=token,
            )
            return
        except Exception as e:
            if not _is_hf_429(e):
                raise
            if attempt >= max_attempts:
                raise
            wait = _sleep_after_429(e, delay_sec)
            print(
                f"  429 rate limit: sleep {int(wait)}s then retry ({attempt}/{max_attempts}) ...",
                flush=True,
            )
            time.sleep(wait)
            delay_sec = min(delay_sec * 1.5, 1200.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="List repos only")
    ap.add_argument("--only", type=str, default="", help="Comma-separated repo ids to include")
    ap.add_argument(
        "--repo",
        type=str,
        default="",
        help="Un seul repo (recommandé sous PowerShell pour les ids avec /)",
    )
    ap.add_argument("--skip", type=str, default="", help="Comma-separated repo ids to skip")
    ap.add_argument(
        "--manifest-name",
        type=str,
        default="download-manifest.json",
        help="Manifest filename under external/hf/ (avoid clashes if several downloads run)",
    )
    args = ap.parse_args()

    list_path = repo_root() / "datasets/hive-copilot-v1/external/hf-repos.json"
    data = json.loads(list_path.read_text(encoding="utf-8"))
    repos = data["repos"]
    rel_root = data.get("local_root", "datasets/hive-copilot-v1/external/hf")
    out_base = repo_root() / rel_root

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    if args.repo.strip():
        only = {args.repo.strip()}
        # Télécharger un repo absent de hf-repos.json (ex. ToolBench en one-off)
        repos = [{"repo_id": args.repo.strip(), "note": "CLI --repo"}]
    skip = {x.strip() for x in args.skip.split(",") if x.strip()}

    manifest: list[dict] = []

    for entry in repos:
        rid = entry["repo_id"]
        if only and rid not in only:
            continue
        if rid in skip:
            manifest.append({"repo_id": rid, "status": "skipped", "reason": "--skip"})
            continue

        safe = rid.replace("/", "__")
        dest = out_base / safe
        note = entry.get("note", "")

        if args.dry_run:
            print(f"[dry-run] {rid} -> {dest} ({note})")
            manifest.append({"repo_id": rid, "status": "dry-run", "path": str(dest)})
            continue

        dest.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {rid} -> {dest} ...", flush=True)
        try:
            _snapshot_with_429_retries(rid, dest)
            manifest.append({"repo_id": rid, "status": "ok", "path": str(dest), "note": note})
            print(f"  OK {rid}", flush=True)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            manifest.append({"repo_id": rid, "status": "error", "error": err, "note": note})
            print(f"  FAIL {rid}: {err}", flush=True)
            traceback.print_exc()

    mname = args.manifest_name.strip().replace("\\", "/").split("/")[-1] or "download-manifest.json"
    manifest_path = out_base / mname
    if not args.dry_run:
        out_base.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"Wrote {manifest_path}", flush=True)

    failed = sum(1 for m in manifest if m.get("status") == "error")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
