// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createModuleLogger } from "../../logger";
import { getOllamaBaseUrl } from "../../runtime-instance-config";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-executor");

export async function executeRagNode(node: WorkflowNode, variables: Record<string, unknown>): Promise<unknown> {
  const { collection, template, topK, embeddingModel } = node.data;
  const query = template ? substituteVariables(template, variables) : String(variables.lastOutput ?? "");
  const k = topK ?? 5;

  log.info("workflow_executor.rag_search", { nodeId: node.id, collection, query, topK: k });

  // Step 1: Generate embedding via Ollama or OpenAI
  let embedding: number[] | null = null;
  const model = embeddingModel ?? "nomic-embed-text";
  const ollamaUrl = getOllamaBaseUrl();

  try {
    const embResp = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: query }),
      signal: AbortSignal.timeout(30_000),
    });
    if (embResp.ok) {
      const embJson = await embResp.json();
      embedding = embJson.embedding;
    }
  } catch (err) {
    log.warn("workflow_executor.rag_embedding_failed", {
      nodeId: node.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 2: Query pgvector if DATABASE_URL is set and we got an embedding
  const collectionName = collection ?? "default";

  if (embedding && process.env.DATABASE_URL) {
    try {
      // Use raw SQL via drizzle to query pgvector
      const embStr = `[${embedding.join(",")}]`;
      const rows = await db.execute(sql`
        SELECT id, content, metadata,
               1 - (embedding <=> ${embStr}::vector) as similarity
        FROM vector_documents
        WHERE collection = ${collectionName}
        ORDER BY embedding <=> ${embStr}::vector
        LIMIT ${k}
      `);

      const results = (rows as unknown as Array<{ id: string; content: string; metadata: unknown; similarity: number }>)
        .map((r) => ({ id: r.id, content: r.content, metadata: r.metadata, similarity: r.similarity }));

      variables.lastOutput = { query, collection: collectionName, results };
      return variables.lastOutput;
    } catch (err) {
      log.warn("workflow_executor.rag_pgvector_failed", {
        nodeId: node.id,
        error: err instanceof Error ? err.message : String(err),
        hint: "Ensure vector_documents table exists with pgvector extension",
      });
    }
  }

  // Fallback: return embedding + empty results so downstream can see query was processed
  const result = {
    query,
    collection: collectionName,
    topK: k,
    embedding: embedding ? `[${embedding.length}d vector]` : null,
    results: [],
    note: embedding
      ? "Embedding generated but no vector_documents table found — create with pgvector"
      : "Embedding generation failed — ensure Ollama is running with " + model,
  };
  variables.lastOutput = result;
  return result;
}

