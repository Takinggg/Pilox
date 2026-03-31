# Hive copilot dataset — audit

Generated: 2026-03-25T22:13:53.477Z

## Summary

| Metric | Value |
|--------|-------|
| Blocks (hive-blocks-v1.json) | 19 |
| Canonical runtime images (canonical) | 19 |
| RAG chunks (*.md) | 19 |
| train.jsonl (gold) | 44 |
| synthetic-train.jsonl | 7898 |
| synthetic-val.jsonl | 910 |
| combined-train.jsonl | 11931 |
| golden-eval.jsonl (held-out) | 24 |
| public-sources-train.jsonl | 3989 |

## Per-file quality

### train.jsonl

- Lines: 44, parse errors: 0
- Messages per record: min 3, max 5
- Roles (token count): {"system":44,"user":46,"assistant":46}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 306, min 160, max 930
- Locales: {"en":1,"fr":2}

### synthetic-train.jsonl

- Lines: 7898, parse errors: 0
- Messages per record: min 3, max 3
- Roles (token count): {"system":7898,"user":7898,"assistant":7898}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 136, min 76, max 226
- Locales: {"en":6384,"fr":1514}

### synthetic-val.jsonl

- Lines: 910, parse errors: 0
- Messages per record: min 3, max 3
- Roles (token count): {"system":910,"user":910,"assistant":910}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 133, min 77, max 211
- Locales: {"en":740,"fr":170}

### combined-train.jsonl

- Lines: 11931, parse errors: 0
- Messages per record: min 3, max 5
- Roles (token count): {"system":11931,"user":11933,"assistant":11933}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 205, min 76, max 930
- Locales: {"en":10374,"fr":1516}

### golden-eval.jsonl

- Lines: 24, parse errors: 0
- Messages per record: min 3, max 3
- Roles (token count): {"system":24,"user":24,"assistant":24}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 173, min 119, max 248

### public-sources-train.jsonl

- Lines: 3989, parse errors: 0
- Messages per record: min 3, max 3
- Roles (token count): {"system":3989,"user":3989,"assistant":3989}
- Missing system/user/assistant in any record: 0/0/0
- Assistant reply length (chars): avg 339, min 324, max 355
- Locales: {"en":3989}

## External HF manifests

- download-manifest-fast.json: 11 entries

## Notes

- **combined-train** = gold + synthetic (+ public when present); **golden-eval** must stay out of training.
- Full JSON: `reports/dataset-audit.json`.
