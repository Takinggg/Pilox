# Bloc Hive — Générique / revue

**Image Docker:** `hive/generic-agent:latest`  
**Rôle:** fallback  
**ID:** `generic-agent`

## À quoi ça sert

Placeholder quand l’import ne mappe pas un nœud source vers un runtime connu.

## Quand l’utiliser

- Temporairement après import Flowise/Langflow/n8n incomplet

## Quand ne pas l’utiliser

- Comme choix de design — toujours remplacer par le bon `hive/*` après analyse

## Comment ça fonctionne

Ne définit pas un comportement précis ; nécessite revue humaine ou reclassement.

## Enchaînements typiques

- **En amont (souvent):** —
- **En aval (souvent):** —

## Association avec d’autres blocs

Remplacer par llm-agent, tool-agent, rag-agent, etc.

## Configuration (indices)

_—_

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Tout nœud non mappé

## Pièges à éviter

- Ne pas déployer en prod sans remapping.
