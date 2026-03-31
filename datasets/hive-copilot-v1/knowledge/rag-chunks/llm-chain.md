# Bloc Hive — Chaîne LLM

**Image Docker:** `hive/llm-chain:latest`  
**Rôle:** chain  
**ID:** `llm-chain`

## À quoi ça sert

Orchestration de chaînes LangChain-style : enchaînement de prompts / étapes LLM séquentielles.

## Quand l’utiliser

- Flowise Chains
- Langflow ConversationChain, LLMChain
- n8n chainLlm
- Patterns multi-étapes fixes.

## Quand ne pas l’utiliser

- Boucles sur collections — `hive/iterator-agent:latest`.
- Branchement conditionnel complexe — `hive/router-agent:latest`.

## Comment ça fonctionne

Enchaîne des appels modèle avec état de chaîne ; moins flexible qu’un agent tool-calling pur.

## Enchaînements typiques

- **En amont (souvent):** `hive/http-input:latest`, `hive/prompt-template:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/output-parser:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

`hive/prompt-template:latest` en amont pour les gabarits.

## Configuration (indices)

- chaîne définie dans le graphe importé

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Chains
- Langflow: LLMChain, ConversationChain
- n8n: chainLlm

## Pièges à éviter

- Coût cumulé des étapes — surveiller budget.
