# Bloc Hive — Prompt template

**Image Docker:** `hive/prompt-template:latest`  
**Rôle:** prompt  
**ID:** `prompt-template`

## À quoi ça sert

Gabarits de prompts réutilisables, variables injectées.

## Quand l’utiliser

- Flowise Prompts
- Langflow Prompt
- Standardiser les instructions système

## Quand ne pas l’utiliser

- Un seul prompt statique dans `llm.systemPrompt` suffit

## Comment ça fonctionne

Rend le template avec le contexte puis passe au LLM.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/llm-chain:latest`

## Association avec d’autres blocs

Avant tout bloc LLM ou chaîne.

## Configuration (indices)

_—_

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Prompts
- Langflow: Prompt

## Pièges à éviter

- Injection de variables utilisateur non échappées.
