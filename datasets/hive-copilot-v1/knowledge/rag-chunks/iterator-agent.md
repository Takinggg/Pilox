# Bloc Hive — Itération

**Image Docker:** `hive/iterator-agent:latest`  
**Rôle:** loop  
**ID:** `iterator-agent`

## À quoi ça sert

Boucle sur collections (batch), appels répétés.

## Quand l’utiliser

- Dify iteration
- Traitement ligne par ligne
- Backpressure avec limite de concurrence

## Quand ne pas l’utiliser

- Un seul chemin conditionnel — router

## Comment ça fonctionne

Itère avec contrôle de concurrence et reprises.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`, `hive/code-runner:latest`
- **En aval (souvent):** `hive/api-caller:latest`, `hive/llm-agent:latest`

## Association avec d’autres blocs

`hive/api-caller` pour appels par élément.

## Configuration (indices)

- batch size
- idempotency

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Dify: iteration

## Pièges à éviter

- Dépasser rate limits ; prévoir checkpoint.
