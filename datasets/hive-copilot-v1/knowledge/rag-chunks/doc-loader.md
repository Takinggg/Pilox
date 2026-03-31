# Bloc Hive — Chargement documents

**Image Docker:** `hive/doc-loader:latest`  
**Rôle:** ingest  
**ID:** `doc-loader`

## À quoi ça sert

Ingestion de fichiers / URLs vers texte brut pour indexation.

## Quand l’utiliser

- RAG : PDF, HTML, etc.
- Flowise Document Loaders

## Quand ne pas l’utiliser

- Données déjà en texte dans le pipeline — sauter vers text-processor.

## Comment ça fonctionne

Parse et extrait le texte ; gère formats supportés par l’implémentation.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`
- **En aval (souvent):** `hive/text-processor:latest`, `hive/embedding-agent:latest`

## Association avec d’autres blocs

`text-processor` puis `embedding-agent` pour RAG.

## Configuration (indices)

- sources de fichiers
- limites de taille

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Document Loaders

## Pièges à éviter

- Documents volumineux — chunking obligatoire.
