# Bloc Hive — Exécution de code

**Image Docker:** `hive/code-runner:latest`  
**Rôle:** code  
**ID:** `code-runner`

## À quoi ça sert

Code déterministe (Python/JS selon policy) : parsing, validation, agrégation.

## Quand l’utiliser

- Normalisation CSV/JSON
- Signature webhook
- Dify/n8n Code

## Quand ne pas l’utiliser

- Raisonnement flou — LLM
- Gros traitements hors sandbox

## Comment ça fonctionne

Exécution sandbox avec politique réseau/fichiers limitée.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`, `hive/api-caller:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

Entre ingress et LLM pour nettoyer les entrées.

## Configuration (indices)

- workflow-code-node-policy côté plateforme

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Langflow: CustomComponent, PythonFunction
- Dify: code
- n8n: code

## Pièges à éviter

- Pas d’accès arbitraire au réseau si policy interdit.
