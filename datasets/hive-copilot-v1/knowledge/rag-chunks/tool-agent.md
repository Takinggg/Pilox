# Bloc Hive — Outils / tools

**Image Docker:** `hive/tool-agent:latest`  
**Rôle:** tools  
**ID:** `tool-agent`

## À quoi ça sert

Exposition d’actions externes : recherche web, API, intégrations, outils MCP.

## Quand l’utiliser

- Appels sortants structurés
- Dify `tool`
- Flowise Tools
- Complément à `hive/llm-agent:latest` pour l’exécution d’outils.

## Quand ne pas l’utiliser

- HTTP arbitraire sans schéma d’outil — parfois `hive/api-caller:latest` plus direct.

## Comment ça fonctionne

Le LLM choisit l’outil ; le bloc exécute avec credentials limités.

## Enchaînements typiques

- **En amont (souvent):** `hive/llm-agent:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

`hive/llm-agent:latest` comme cerveau.

## Configuration (indices)

- tools[] dans agent_config
- scopes OAuth

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Tools, customTool
- Dify: tool

## Pièges à éviter

- Limiter les scopes ; pas d’exfiltration de secrets.
