# Bloc Hive — Texte / templates

**Image Docker:** `hive/text-processor:latest`  
**Rôle:** text  
**ID:** `text-processor`

## À quoi ça sert

Découpe, fusion, templates, assignation de variables (ETL texte).

## Quand l’utiliser

- Chunking
- templates Dify
- normalisation avant LLM

## Quand ne pas l’utiliser

- Logique complexe avec librairies — `hive/code-runner:latest`.

## Comment ça fonctionne

Transformations déterministes sur chaînes.

## Enchaînements typiques

- **En amont (souvent):** `hive/doc-loader:latest`, `hive/http-input:latest`
- **En aval (souvent):** `hive/embedding-agent:latest`, `hive/llm-agent:latest`

## Association avec d’autres blocs

Entre loader et embedding ou LLM.

## Configuration (indices)

_—_

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Text Splitters
- Dify: template-transform, variable-assigner

## Pièges à éviter

- Encodage et séparateurs de chunks.
