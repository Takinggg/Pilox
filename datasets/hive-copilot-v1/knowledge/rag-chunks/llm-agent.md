# Bloc Hive — Agent LLM

**Image Docker:** `hive/llm-agent:latest`  
**Rôle:** llm  
**ID:** `llm-agent`

## À quoi ça sert

Appels au modèle de langage : chat, génération, classification, extraction, raisonnement. Peut orchestrer des tools via la config.

## Quand l’utiliser

- Besoin de NLU, génération de texte, décision, reformulation.
- Agent avec tools MCP / function calling (config `tools` dans agent_config).
- Imports : Flowise Chat Models / Agents, Langflow *Model, Dify llm / classifier / parameter-extractor, n8n LLM / agent.

## Quand ne pas l’utiliser

- Pure retrieval sans génération — souvent `hive/rag-agent:latest` seul ou en amont.
- Logique 100 % déterministe sans LLM — préférer `hive/code-runner:latest`.

## Comment ça fonctionne

Consomme le contexte (messages, retrieval, tools). Paramètres via `llm` dans agent_config : model, temperature, systemPrompt, etc.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`, `hive/rag-agent:latest`, `hive/prompt-template:latest`, `hive/output-parser:latest`
- **En aval (souvent):** `hive/output-parser:latest`, `hive/http-output:latest`, `hive/api-caller:latest`

## Association avec d’autres blocs

Souvent après RAG pour répondre avec contexte ; avant `output-parser` pour JSON structuré.

## Configuration (indices)

- llm.providerId
- llm.model
- llm.systemPrompt
- llm.temperature
- tools[]
- memory

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: chatOpenAI, Agents…
- Langflow: OpenAIModel, OllamaModel…
- Dify: llm
- n8n: lmChatOpenAi, agent

## Pièges à éviter

- Budget tokens (budget.*, guardrails.*).
- Ne jamais coller de secrets dans le prompt utilisateur.
