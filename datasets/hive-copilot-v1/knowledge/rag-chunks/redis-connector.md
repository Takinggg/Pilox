# Bloc Hive — Redis

**Image Docker:** `hive/redis-connector:latest`  
**Rôle:** cache  
**ID:** `redis-connector`

## À quoi ça sert

Cache, files, verrous, dédup idempotence.

## Quand l’utiliser

- n8n redis
- Dedup webhooks
- Rate limit côté data

## Quand ne pas l’utiliser

- Source de vérité long terme — préférer SQL

## Comment ça fonctionne

Clé-valeur TTL, structures Redis selon besoin.

## Enchaînements typiques

- **En amont (souvent):** `hive/db-connector:latest`, `hive/code-runner:latest`
- **En aval (souvent):** `hive/http-output:latest`

## Association avec d’autres blocs

Après traitement pour marquer idempotence.

## Configuration (indices)

- TTL
- namespace clés

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- n8n: redis

## Pièges à éviter

- Eviction ; pas de secrets en clair dans les clés.
