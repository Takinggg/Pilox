# Bloc Hive — HTTP / entrée

**Image Docker:** `hive/http-input:latest`  
**Rôle:** ingress  
**ID:** `http-input`

## À quoi ça sert

Point d’entrée des requêtes utilisateur ou webhooks : expose l’agent au réseau (HTTP, chat, webhook).

## Quand l’utiliser

- Tout flux conversationnel ou API où un client externe envoie une requête.
- Démarrage d’un workflow importé depuis Dify (`start`), n8n (`webhook`), Langflow (`ChatInput`, `TextInput`).

## Quand ne pas l’utiliser

- Tâches purement batch sans ingress réseau (préférer un déclencheur scheduler + nœud adapté en amont).
- Ne remplace pas l’auth : valider signatures / tokens au niveau plateforme ou nœud suivant.

## Comment ça fonctionne

Reçoit la requête, normalise le format (body, headers) pour le reste du graphe. Souvent la première étape d’une chaîne.

## Enchaînements typiques

- **En amont (souvent):** —
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/router-agent:latest`, `hive/code-runner:latest`, `hive/rag-agent:latest`

## Association avec d’autres blocs

Presque toujours suivi d’un bloc qui traite le contenu (LLM, routeur, code). Se termine souvent par `hive/http-output:latest` pour répondre.

## Configuration (indices)

- runtime.port
- healthPath si applicable
- chatFormat côté runtime si chat

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Dify: start
- n8n: webhook
- Langflow: ChatInput, TextInput
- Flowise: entrée de chatflow

## Pièges à éviter

- Ne pas exposer de secrets dans l’URL ou le corps des messages en clair.
