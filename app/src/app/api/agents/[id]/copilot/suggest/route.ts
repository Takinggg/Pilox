import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { createModuleLogger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

const log = createModuleLogger("api.agents.copilot");

const COPILOT_SYSTEM_PROMPT = `You are the Pilox canvas copilot. You MUST only use these exact Hive runtime images — never invent new ones:
hive/http-input:latest, hive/http-output:latest, hive/llm-agent:latest, hive/llm-chain:latest, hive/rag-agent:latest, hive/embedding-agent:latest, hive/tool-agent:latest, hive/memory-agent:latest, hive/doc-loader:latest, hive/text-processor:latest, hive/output-parser:latest, hive/prompt-template:latest, hive/api-caller:latest, hive/code-runner:latest, hive/router-agent:latest, hive/iterator-agent:latest, hive/db-connector:latest, hive/redis-connector:latest, hive/generic-agent:latest.

Available canvas node types: llm, agent, prompt, rag, memory, tool, http, code, transform, router, loop, embedding, classifier, image_gen, audio, end.

When suggesting nodes, respond ONLY with valid JSON (no markdown):
{
  "suggestions": [
    { "nodeType": "string", "label": "string", "reasoning": "string" }
  ],
  "connections": [
    { "from": "existing-node-id-or-new", "to": "existing-node-id-or-new" }
  ]
}`;

const suggestSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string().optional(),
      label: z.string().optional(),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
  userIntent: z.string().min(1).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/copilot/suggest", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);
    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);

    const bodyResult = await readJsonBodyLimited(req, 16_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", bodyResult.status);
    }

    const parsed = suggestSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.INVALID_INPUT, parsed.error.message, 400);
    }

    const { nodes, edges, userIntent } = parsed.data;

    const userPrompt = buildUserPrompt(nodes, edges, userIntent);

    try {
      const inferencePort = process.env.INFERENCE_PORT || "11434";
      const baseUrl = `http://127.0.0.1:${inferencePort}`;

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.PILOX_COPILOT_MODEL || "hive-copilot",
          messages: [
            { role: "system", content: COPILOT_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          options: { temperature: 0.3, num_predict: 1024 },
        }),
      });

      if (!res.ok) {
        log.error("copilot_inference_failed", { status: res.status });
        return errorResponse(ErrorCode.INTERNAL_ERROR, "Copilot inference failed", 502);
      }

      const json = await res.json();
      const content = json.message?.content || "";
      const suggestions = parsesuggestions(content);

      return NextResponse.json({ suggestions, raw: content });
    } catch (err) {
      log.error("copilot_error", { error: String(err) });
      return errorResponse(ErrorCode.INTERNAL_ERROR, "Copilot unavailable", 503);
    }
  });
}

function buildUserPrompt(
  nodes: { id: string; type?: string; label?: string }[],
  edges: { source: string; target: string }[],
  intent: string,
): string {
  const nodesSummary = nodes
    .map((n) => `${n.id}: ${n.type || "unknown"} (${n.label || "unlabeled"})`)
    .join("\n  ");

  const edgesSummary = edges
    .map((e) => `${e.source} -> ${e.target}`)
    .join("\n  ");

  return `Current workflow:
  Nodes:
  ${nodesSummary || "(empty canvas)"}
  Connections:
  ${edgesSummary || "(none)"}

User wants: "${intent}"

Suggest nodes to add and how to connect them.`;
}

function parsesuggestions(content: string): Array<{
  nodeType: string;
  label: string;
  reasoning: string;
}> {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed.suggestions)) {
      return parsed.suggestions.filter(
        (s: Record<string, unknown>) => s.nodeType && s.label,
      );
    }
    return [];
  } catch {
    return [];
  }
}
