import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { createModuleLogger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

const log = createModuleLogger("api.agents.copilot");

const VALID_NODE_TYPES = [
  "llm", "agent", "prompt", "rag", "memory", "tool",
  "http", "code", "transform", "router", "loop",
  "embedding", "classifier", "image_gen", "audio", "end",
] as const;

const COPILOT_SYSTEM_PROMPT = `You are Pilox Copilot — an expert workflow builder that generates FULLY CONFIGURED pipelines.

AVAILABLE NODE TYPES: ${VALID_NODE_TYPES.join(", ")}

RULES:
1. Reply with ONLY a JSON object — no markdown, no explanation.
2. Each suggestion MUST include nodeType, label, reasoning, AND config (pre-filled parameters).
3. Use realistic values — real model names, real variable references, real templates.
4. Nodes connect sequentially. Use {{lastOutput}} to chain outputs. Use {{input}} for the first node.

CONFIG FIELDS BY NODE TYPE:
- llm: { model: "llama3.2:3b", provider: "ollama", systemPrompt: "...", template: "{{lastOutput}}", temperature: 0.7, maxTokens: 4096 }
- rag: { collection: "my-documents", template: "{{lastOutput}}", topK: 5, embeddingModel: "nomic-embed-text", outputVariable: "ragResults" }
- memory: { memoryType: "buffer", memoryAction: "read"|"write", sessionKey: "{{input.sessionId}}", outputVariable: "conversationHistory" }
- prompt: { template: "Context: {{ragResults}}\\nHistory: {{conversationHistory}}\\nQuestion: {{lastOutput}}", outputVariable: "formattedPrompt" }
- transform: { template: "{{lastOutput}}", outputVariable: "transformed" }
- http: { url: "https://api.example.com/data", method: "GET", outputVariable: "apiResponse" }
- code: { language: "javascript", codeContent: "return { result: input.data }", outputVariable: "processed" }
- classifier: { classifierLabels: "positive,negative,neutral", template: "{{lastOutput}}" }
- embedding: { model: "nomic-embed-text", provider: "ollama" }
- router: { condition: "status == 'ok'" }
- loop: { loopVariable: "items", maxIterations: 100 }
- image-gen: { model: "dall-e-3", provider: "openai", imageSize: "1024x1024", template: "{{lastOutput}}" }
- audio: { audioAction: "transcribe", model: "whisper-1", provider: "openai" }

RESPONSE FORMAT:
{"suggestions":[{"nodeType":"memory","label":"Load History","reasoning":"Read conversation buffer","config":{"memoryType":"buffer","memoryAction":"read","sessionKey":"{{input.sessionId}}","outputVariable":"conversationHistory"}},{"nodeType":"rag","label":"Doc Search","reasoning":"Find relevant docs","config":{"collection":"knowledge-base","template":"{{lastOutput}}","topK":5,"embeddingModel":"nomic-embed-text","outputVariable":"ragResults"}}]}

EXAMPLE — "RAG chatbot with memory":
{"suggestions":[{"nodeType":"memory","label":"Load History","reasoning":"Read conversation context","config":{"memoryType":"buffer","memoryAction":"read","sessionKey":"{{input.sessionId}}","outputVariable":"history"}},{"nodeType":"rag","label":"Doc Search","reasoning":"Retrieve relevant knowledge","config":{"collection":"docs","template":"{{input.query}}","topK":5,"embeddingModel":"nomic-embed-text","outputVariable":"context"}},{"nodeType":"prompt","label":"Build Prompt","reasoning":"Combine context + history + question","config":{"template":"Context: {{context}}\\nHistory: {{history}}\\nQuestion: {{input.query}}\\nAnswer:","outputVariable":"prompt"}},{"nodeType":"llm","label":"Generate Answer","reasoning":"Produce grounded response","config":{"model":"llama3.2:3b","provider":"ollama","template":"{{prompt}}","systemPrompt":"You are a helpful assistant. Answer based on the provided context only.","temperature":0.3,"maxTokens":2048,"outputVariable":"answer"}},{"nodeType":"memory","label":"Save Exchange","reasoning":"Store Q&A for future context","config":{"memoryType":"buffer","memoryAction":"write","sessionKey":"{{input.sessionId}}"}}]}`;

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
      const baseUrl = process.env.OLLAMA_URL || `http://127.0.0.1:${process.env.INFERENCE_PORT || "11434"}`;

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
          options: { temperature: 0.2, num_predict: 512 },
        }),
      });

      if (!res.ok) {
        log.error("copilot_inference_failed", { status: res.status });
        return errorResponse(ErrorCode.INTERNAL_ERROR, "Copilot inference failed", 502);
      }

      const json = await res.json();
      const content = json.message?.content || "";
      const suggestions = parseSuggestions(content);

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
  const hasNodes = nodes.length > 0;
  const ctx = hasNodes
    ? `Current nodes: ${nodes.map((n) => `${n.type || "?"}(${n.label || n.id})`).join(", ")}. Connections: ${edges.map((e) => `${e.source}->${e.target}`).join(", ") || "none"}.`
    : "Empty canvas.";

  return `${ctx}\nUser wants: "${intent}"\nRespond with JSON only.`;
}

const validNodeTypeSet = new Set<string>(VALID_NODE_TYPES);

function parseSuggestions(content: string): Array<{
  nodeType: string;
  label: string;
  reasoning: string;
}> {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (!jsonMatch) {
      // Try parsing the whole content as JSON
      const direct = JSON.parse(content.trim());
      if (Array.isArray(direct.suggestions)) {
        return filterSuggestions(direct.suggestions);
      }
      return [];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed.suggestions)) {
      return filterSuggestions(parsed.suggestions);
    }
    return [];
  } catch {
    // Last resort: try to find individual suggestion objects
    try {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const arr = JSON.parse(arrayMatch[0]);
        if (Array.isArray(arr)) return filterSuggestions(arr);
      }
    } catch { /* ignore */ }
    return [];
  }
}

function filterSuggestions(
  raw: Array<Record<string, unknown>>,
): Array<{ nodeType: string; label: string; reasoning: string }> {
  return raw
    .filter((s) => s.nodeType && s.label)
    .map((s) => ({
      nodeType: validNodeTypeSet.has(s.nodeType as string)
        ? (s.nodeType as string)
        : mapToValidType(s.nodeType as string),
      label: String(s.label),
      reasoning: String(s.reasoning || ""),
    }))
    .filter((s) => s.nodeType !== "unknown");
}

/** Best-effort mapping of hallucinated types to valid ones */
function mapToValidType(raw: string): string {
  const lower = raw.toLowerCase().replace(/[_-]/g, "");
  const map: Record<string, string> = {
    llmagent: "llm", llmcall: "llm", chat: "llm", chatbot: "llm",
    ragagent: "rag", ragsearch: "rag", vectorstore: "rag", retriever: "rag", docsearch: "rag",
    memoryagent: "memory", memorystore: "memory", buffer: "memory", conversationmemory: "memory",
    httpinput: "http", httpoutput: "http", httprequest: "http", webhook: "http", apicaller: "http",
    coderunner: "code", codegen: "code", javascript: "code",
    routeragent: "router", condition: "router", ifelse: "router", branch: "router",
    iteratoragent: "loop", foreach: "loop", iteration: "loop",
    embeddingagent: "embedding", vectorembedding: "embedding",
    toolagent: "tool", mcp: "tool", functioncall: "tool",
    textprocessor: "transform", datatransform: "transform",
    outputparser: "transform", jsonparser: "transform",
    prompttemplate: "prompt", systemprompt: "prompt",
    imagegen: "image_gen", dalle: "image_gen", stablediffusion: "image_gen",
    speechtotext: "audio", texttospeech: "audio", whisper: "audio", tts: "audio",
    textclassification: "classifier", classify: "classifier",
    docloader: "llm", pdfloader: "llm",
    start: "http", end: "end",
    vectorstoreretriever: "rag", similaritysearch: "rag", answergenerator: "llm",
    httprequesthandler: "http", returnresponse: "http",
  };
  return map[lower] || "unknown";
}
