# Bloc Hive — Mémoire

**Image Docker:** `hive/memory-agent:latest`  
**Rôle:** memory  
**ID:** `memory-agent`

## À quoi ça sert

Persistance courte ou longue : buffer de messages, mémoire vectorielle.

## Quand l’utiliser

- Conversations multi-tours
- Flowise bufferMemory

## Quand ne pas l’utiliser

- Données réglementées sans politique de rétention — préférer `memory.type none`.

## Comment ça fonctionne

Injecte l’historique ou rappels sémantiques dans le contexte LLM.

## Enchaînements typiques

- **En amont (souvent):** `hive/llm-agent:latest`
- **En aval (souvent):** `hive/llm-agent:latest`

## Association avec d’autres blocs

Toujours avec `hive/llm-agent:latest`.

## Configuration (indices)

- memory.type: buffer | vector | none
- bufferSize
- vectorStoreUrl

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: Memory

## Pièges à éviter

- PII dans l’historique — filtrer ou TTL.
