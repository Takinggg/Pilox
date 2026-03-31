# Bloc Hive — RAG / retrieval

**Image Docker:** `hive/rag-agent:latest`  
**Rôle:** rag  
**ID:** `rag-agent`

## À quoi ça sert

Retrieval sur base vectorielle, QA avec documents, chaînes retrieval+QA.

## Quand l’utiliser

- Questions sur docs internes, base de connaissances.
- Flowise: Vector Stores, Retrievers, conversationalRetrievalQAChain.
- Langflow: Chroma, FAISS, VectorStoreRetriever, RetrievalQA.
- Dify: knowledge-retrieval ; n8n: vector store / retrieval QA.

## Quand ne pas l’utiliser

- Index et requête avec des embeddings de dimensions/modèles différents — réindexer.

## Comment ça fonctionne

Interroge le store, renvoie des chunks au LLM ou fait la boucle QA selon config.

## Enchaînements typiques

- **En amont (souvent):** `hive/embedding-agent:latest`, `hive/doc-loader:latest`, `hive/text-processor:latest`
- **En aval (souvent):** `hive/llm-agent:latest`, `hive/http-output:latest`

## Association avec d’autres blocs

Toujours avec le **même** modèle d’embedding à l’index et à la requête ; en amont `embedding-agent` + loaders.

## Configuration (indices)

- memory.vectorStoreUrl si pertinent
- alignement embedding

## Correspondance imports (Flowise / Langflow / Dify / n8n)

- Flowise: chromaDB, retrievers…
- Langflow: RAG components
- Dify: knowledge-retrieval

## Pièges à éviter

- Hallucination si chunks vides — instructer le LLM à dire « je ne sais pas ».
