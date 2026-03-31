# Bloc Hive — HTTP / sortie

**Image Docker:** `hive/http-output:latest`  
**Rôle:** egress  
**ID:** `http-output`

## À quoi ça sert

Retourne la réponse finale au client (HTTP, webhook response).

## Quand l’utiliser

- Réponse synchrone à une requête entrante.
- Fin de workflow Dify (`end`, `answer`), n8n `respondToWebhook`, Langflow `ChatOutput`.

## Quand ne pas l’utiliser

- Sortie vers un canal non-HTTP (email, Slack) — utiliser `hive/api-caller:latest` vers l’API du canal.

## Comment ça fonctionne

Sérialise le résultat du graphe vers la réponse HTTP attendue (JSON, SSE, etc. selon config).

## Enchaînements typiques

- **En amont (souvent):** `hive/llm-agent:latest`, `hive/rag-agent:latest`, `hive/code-runner:latest`, `hive/output-parser:latest`
- **En aval (souvent):** —

## Association avec d’autres blocs

Ferme la chaîne après traitement. Souvent pair logique avec `hive/http-input:latest`.

## Configuration (indices)

- runtime.chatFormat
- timeoutSeconds

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Dify: end, answer
- n8n: respondToWebhook
- Langflow: ChatOutput, TextOutput

## Pièges à éviter

- Cohérence du format de réponse avec ce que le client attend (contrat API).
