#!/usr/bin/env python3
"""
Download n8n community workflow JSON from the public templates API (api.n8n.io).

  pip install -r app/scripts/requirements-datasets.txt
  python app/scripts/download-n8n-community-workflows.py --max 450
  python app/scripts/download-n8n-community-workflows.py --max 50 --dry-run

Source: https://api.n8n.io (same data as https://n8n.io/workflows/ ).
Category filters on the website are not reliably exposed on the list endpoint we tested;
this script paginates GET /templates/search with **page** and **rows** (offset/limit are ignored by the API as of 2025).

Output: datasets/hive-copilot-v1/external/n8n-community-workflows/*.json + download-manifest.json
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


USER_AGENT = "Hive-dataset-downloader/1.0 (+https://github.com/)"

BASE = "https://api.n8n.io"

# Transient API / CDN failures (api.n8n.io occasionally returns 502 on pagination).
RETRYABLE_HTTP = frozenset({429, 502, 503, 504})


def http_json(
    url: str,
    sleep: float,
    not_found_ok: bool = False,
    retries: int = 6,
) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_err: BaseException | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read().decode("utf-8")
            if sleep > 0:
                time.sleep(sleep)
            return json.loads(data)
        except urllib.error.HTTPError as e:
            if not_found_ok and e.code == 404:
                if sleep > 0:
                    time.sleep(sleep)
                return None
            body = e.read()[:500] if e.fp else b""
            if e.code in RETRYABLE_HTTP and attempt + 1 < retries:
                wait = min(60.0, (2**attempt) * 1.5 + (sleep or 0))
                print(f"  retry {attempt + 1}/{retries} HTTP {e.code} in {wait:.1f}s -> {url[:80]}...", flush=True)
                time.sleep(wait)
                last_err = e
                continue
            raise SystemExit(f"HTTP {e.code} {url}: {body!r}") from e
        except (TimeoutError, urllib.error.URLError, OSError) as e:
            if attempt + 1 < retries:
                wait = min(60.0, (2**attempt) * 1.5 + (sleep or 0))
                print(f"  retry {attempt + 1}/{retries} {type(e).__name__} in {wait:.1f}s -> {url[:80]}...", flush=True)
                time.sleep(wait)
                last_err = e
                continue
            raise SystemExit(f"{type(e).__name__} {url}: {e}") from e
    raise SystemExit(f"exhausted retries for {url}: {last_err!r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=450, help="Max workflows to download (default 450 ≈ 75×6 categories if run repeatedly with page-start)")
    ap.add_argument("--page-start", type=int, default=1, help="First page for /templates/search (1-based)")
    ap.add_argument("--page-size", type=int, default=100, help="rows= per page (max templates per list request)")
    ap.add_argument("--sleep", type=float, default=0.12, help="Delay between HTTP calls (seconds)")
    ap.add_argument("--retries", type=int, default=6, help="Retries for transient HTTP/network errors")
    ap.add_argument("--dry-run", action="store_true", help="Only print plan, no writes")
    args = ap.parse_args()

    root = repo_root()
    out_dir = root / "datasets/hive-copilot-v1/external/n8n-community-workflows"
    manifest_path = out_dir / "download-manifest.json"

    collected: list[dict] = []
    seen_ids: set[int] = set()
    page = max(1, args.page_start)
    total_available: int | None = None
    # Extra IDs so we can still reach --max if some templates 404 on detail
    target_ids = max(args.max * 2, args.max + 50)

    while len(collected) < target_ids:
        url = f"{BASE}/templates/search?page={page}&rows={args.page_size}"
        batch = http_json(url, args.sleep, retries=args.retries)
        total_available = batch.get("totalWorkflows")
        workflows = batch.get("workflows") or []
        if not workflows:
            break
        for w in workflows:
            wid = w.get("id")
            name = w.get("name")
            if wid is None or wid in seen_ids:
                continue
            seen_ids.add(wid)
            collected.append({"id": wid, "name": name, "list_meta": {k: w.get(k) for k in ("totalViews", "createdAt", "description") if k in w}})
            if len(collected) >= target_ids:
                break
        page += 1

    if args.dry_run:
        print(json.dumps({"would_download": len(collected), "total_reported": total_available, "sample_ids": [c["id"] for c in collected[:10]]}, indent=2))
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    errors: list[dict] = []
    saved = 0

    for i, item in enumerate(collected):
        if saved >= args.max:
            break
        wid = item["id"]
        path = out_dir / f"{wid}.json"
        if path.is_file() and path.stat().st_size > 100:
            saved += 1
            continue
        try:
            detail = http_json(
                f"{BASE}/workflows/templates/{wid}",
                args.sleep,
                not_found_ok=True,
                retries=args.retries,
            )
            if detail is None:
                errors.append({"id": wid, "error": "404 workflow not found"})
                continue
            wf = detail.get("workflow")
            if not wf:
                errors.append({"id": wid, "error": "no workflow key"})
                continue
            payload = {
                "template_id": detail.get("id", wid),
                "template_name": detail.get("name", item.get("name")),
                "workflow": wf,
            }
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            saved += 1
        except Exception as e:
            errors.append({"id": wid, "error": str(e)})
        if (i + 1) % 25 == 0:
            print(f"  ... {i + 1}/{len(collected)} (saved {saved})", flush=True)

    manifest = {
        "source": BASE,
        "gallery_url": "https://n8n.io/workflows/",
        "requested_max": args.max,
        "downloaded_unique_ids": len(collected),
        "files_written": saved,
        "errors": errors[:50],
        "note": "Community templates; verify license/terms before redistributing or training commercial models.",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps(manifest, indent=2))
    print(f"Wrote -> {out_dir}", flush=True)
    return 0 if saved >= args.max else 1


if __name__ == "__main__":
    raise SystemExit(main())
