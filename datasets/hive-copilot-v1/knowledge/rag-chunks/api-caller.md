# Bloc Hive — Appels HTTP / API

**Image Docker:** `hive/api-caller:latest`  
**Rôle:** http  
**ID:** `api-caller`

## À quoi ça sert

Requêtes HTTP sortantes REST/GraphQL vers services externes.

## Quand l’utiliser

- Langflow APIRequest
- Dify http-request
- n8n httpRequest
- Slack, Confluence, paiements tokenisés

## Quand ne pas l’utiliser

- SSRF : ne pas passer d’URL utilisateur brute sans allowlist

## Comment ça fonctionne

Méthode, headers, body, timeouts (runtime.timeoutSeconds).

## Enchaînements typiques

- **En amont (souvent):** `hive/llm-agent:latest`, `hive/output-parser:latest`, `hive/code-runner:latest`
- **En aval (souvent):** `hive/text-processor:latest`, `hive/llm-agent:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

Souvent après extraction d’URL/paramètres par LLM ou parser.

## Configuration (indices)

- secrets hors graphe
- rate limits

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Langflow: APIRequest
- Dify: http-request
- n8n: httpRequest

## Pièges à éviter

- SSRF, fuite de clés, retry storms.
