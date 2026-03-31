# Bloc Hive — Parseur de sortie

**Image Docker:** `hive/output-parser:latest`  
**Rôle:** parse  
**ID:** `output-parser`

## À quoi ça sert

Forcer JSON, CSV, listes structurées depuis la sortie LLM.

## Quand l’utiliser

- Contrats API
- Flowise Output Parsers
- Après `hive/llm-agent:latest`

## Quand ne pas l’utiliser

- Sortie libre pour humain uniquement

## Comment ça fonctionne

Parse et valide ; autofix optionnel selon config.

## Enchaînements typiques

- **En amont (souvent):** `hive/llm-agent:latest`
- **En aval (souvent):** `hive/api-caller:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

Immédiatement après le LLM qui génère le format demandé.

## Configuration (indices)

- schéma JSON
- autofix

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: structuredOutputParser, …

## Pièges à éviter

- Modèles faibles qui invalident le JSON — retry ou prompt plus strict.
