# Bloc Hive — Routage / branches

**Image Docker:** `hive/router-agent:latest`  
**Rôle:** route  
**ID:** `router-agent`

## À quoi ça sert

Choix de branche conditionnel (if/else, classes d’intention).

## Quand l’utiliser

- Dify if-else
- Tri de requêtes
- Après un classifieur

## Quand ne pas l’utiliser

- Itération sur liste — `hive/iterator-agent:latest`

## Comment ça fonctionne

Évalue condition ou sortie structurée et route vers une sous-chaîne.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`, `hive/llm-agent:latest`
- **En aval (souvent):** `hive/rag-agent:latest`, `hive/llm-agent:latest`, `hive/api-caller:latest`

## Association avec d’autres blocs

Souvent après une classification légère ou un LLM avec sortie structurée.

## Configuration (indices)

_—_

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Dify: if-else

## Pièges à éviter

- Branches déséquilibrées — tests couverture.
