# Bloc Hive — Base SQL

**Image Docker:** `hive/db-connector:latest`  
**Rôle:** database  
**ID:** `db-connector`

## À quoi ça sert

Lecture/écriture SQL via connecteur (ex. Postgres).

## Quand l’utiliser

- n8n postgres
- Tickets, métadonnées structurées

## Quand ne pas l’utiliser

- Requêtes ad hoc depuis le texte utilisateur sans validation — injection SQL

## Comment ça fonctionne

Connexion avec credentials instance ; paramètres bindés.

## Enchaînements typiques

- **En amont (souvent):** `hive/code-runner:latest`, `hive/llm-agent:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/api-caller:latest`

## Association avec d’autres blocs

Code ou parser pour SQL sûr.

## Configuration (indices)

- credentials
- read-only roles

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- n8n: postgres

## Pièges à éviter

- SQL injection ; données sensibles.
