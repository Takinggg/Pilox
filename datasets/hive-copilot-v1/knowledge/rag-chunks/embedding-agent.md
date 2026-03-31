# Bloc Hive — Embeddings

**Image Docker:** `hive/embedding-agent:latest`  
**Rôle:** embedding  
**ID:** `embedding-agent`

## À quoi ça sert

Vectorisation de texte pour indexation ou similarité.

## Quand l’utiliser

- Construction ou mise à jour d’index
- Pipeline RAG en amont de `hive/rag-agent:latest`.

## Quand ne pas l’utiliser

- Inférence chat générale sans besoin de vecteurs.

## Comment ça fonctionne

Transforme texte en vecteurs ; doit être identique entre index et query.

## Enchaînements typiques

- **En amont (souvent):** `hive/doc-loader:latest`, `hive/text-processor:latest`
- **En aval (souvent):** `hive/rag-agent:latest`

## Association avec d’autres blocs

`hive/rag-agent:latest`

## Configuration (indices)

- choix du modèle d’embedding
- dimension fixe

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: openAIEmbeddings
- Langflow: embeddings category

## Pièges à éviter

- Changer de modèle = réindexer tout.
