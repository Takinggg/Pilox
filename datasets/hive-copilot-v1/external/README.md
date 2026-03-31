# Datasets publics (Hugging Face)

- **Liste :** `hf-repos.json`
- **Téléchargement :** depuis `app/` :
  ```bash
  python -m pip install -r scripts/requirements-datasets.txt
  npm run dataset:download-hf
  ```
- **Dossier local :** `hf/` (gitignoré, snapshots complets par dépôt)
- **Manifeste :** `hf/download-manifest.json` après run (statut ok / error par repo)
- **Gated :** définir `HF_TOKEN` pour certains dépôts (ex. BeaverTails)
- **Énorme :** `bigscience/xP3`, `MBZUAI/Bactrian-X`, `teknium/OpenHermes-2.5` — prévoir du temps et de l’espace
- **ToolBench :** non inclus par défaut (repo type `Adorg/ToolBench` ≈ 33k+ fichiers). Ajout manuel :  
  `python scripts/download-public-datasets.py --only Adorg/ToolBench`
