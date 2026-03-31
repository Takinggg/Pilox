#!/usr/bin/env python3
"""Parse multi-document Kubernetes example YAML files (syntax only, no schema)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("validate-k8s-example-yaml: install PyYAML (pip install pyyaml)", file=sys.stderr)
    sys.exit(1)


def collect_targets(paths: list[Path]) -> list[Path]:
    """Expand directories to `*.example.yaml`; keep files as-is."""
    out: list[Path] = []
    for p in paths:
        if p.is_dir():
            out.extend(sorted(p.glob("*.example.yaml")))
        else:
            out.append(p)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Validate multi-document YAML (e.g. deploy/kubernetes examples)."
    )
    ap.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="YAML files or directories containing *.example.yaml",
    )
    args = ap.parse_args()
    targets = collect_targets(args.paths)
    if not targets:
        print("validate-k8s-example-yaml: no files matched", file=sys.stderr)
        sys.exit(1)
    errors = 0
    for path in targets:
        if not path.is_file():
            print(f"MISSING {path}", file=sys.stderr)
            errors += 1
            continue
        try:
            text = path.read_text(encoding="utf-8")
            list(yaml.safe_load_all(text))
            print("OK", path)
        except Exception as e:
            print(f"FAIL {path}: {e}", file=sys.stderr)
            errors += 1
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
