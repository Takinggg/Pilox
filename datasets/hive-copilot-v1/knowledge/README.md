# Base de connaissance Hive — blocs runtime

- **Source canonique (JSON):** `hive-blocks-v1.json` — une entrée par image `hive/*:latest` utilisable par le copilote.
- **Chunks RAG (Markdown):** `rag-chunks/*.md` — générés par `app/scripts/render-hive-blocks-rag.mjs`.
- **Ingestion:** indexer ces fichiers (ou le JSON) dans votre vector store du copilote ; **inclure le système** interdisant d’inventer des blocs hors liste.

Régénérer les MD :

```bash
cd app && npm run dataset:render-blocks-rag
```
