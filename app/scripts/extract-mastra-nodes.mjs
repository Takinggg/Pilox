#!/usr/bin/env node
/**
 * Build static Mastra node catalog for the Hive canvas UI.
 * Env: MASTRA_CLONE_DIR — Mastra git clone; else `%TEMP%/mastra-clone` (Windows) or `$TMPDIR|/tmp/mastra-clone`.
 * Output: app/src/lib/mastra-node-catalog.json
 */
import os from "node:os";
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliLog, cliErr } from "./cli-prefix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");

function mastraCloneRoot() {
  if (process.env.MASTRA_CLONE_DIR) {
    return resolve(process.env.MASTRA_CLONE_DIR);
  }
  const base = process.env.TEMP || process.env.TMPDIR || os.tmpdir();
  return join(base, "mastra-clone");
}

function safeRead(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }
function toLabel(id) { return id.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

try {
  const REPO = mastraCloneRoot();
  const CORE = join(REPO, "packages", "core", "src");
  const STORES = join(REPO, "stores");
  const catalog = [];
const wf = [
  {name:"step",label:"Step",type:"workflow_step",category:"workflow",description:"A single workflow step with createStep(). Has typed input/output schemas, retry, suspend/resume.",inputs:[{label:"Input Data",name:"inputData",type:"schema"},{label:"State",name:"state",type:"schema"},{label:"Resume Data",name:"resumeData",type:"schema"}]},
  {name:"parallel",label:"Parallel",type:"workflow_parallel",category:"workflow",description:"Executes multiple steps concurrently and waits for all branches.",inputs:[{label:"Steps",name:"steps",type:"step[]"}]},
  {name:"conditional",label:"Conditional (Branch)",type:"workflow_conditional",category:"workflow",description:"Routes execution to matching branch step based on condition functions.",inputs:[{label:"Steps",name:"steps",type:"step[]"},{label:"Conditions",name:"conditions",type:"function[]"}]},
  {name:"loop_dowhile",label:"Loop (Do-While)",type:"workflow_loop",category:"workflow",description:"Repeats a step while condition is true (do-while). Runs at least once.",inputs:[{label:"Step",name:"step",type:"step"},{label:"Condition",name:"condition",type:"function"},{label:"Loop Type",name:"loopType",type:"dowhile"}]},
  {name:"loop_dountil",label:"Loop (Do-Until)",type:"workflow_loop",category:"workflow",description:"Repeats a step until condition is true (do-until). Runs at least once.",inputs:[{label:"Step",name:"step",type:"step"},{label:"Condition",name:"condition",type:"function"},{label:"Loop Type",name:"loopType",type:"dountil"}]},
  {name:"foreach",label:"For-Each",type:"workflow_foreach",category:"workflow",description:"Iterates over a collection executing a step per element with configurable concurrency.",inputs:[{label:"Step",name:"step",type:"step"},{label:"Concurrency",name:"concurrency",type:"number"}]},
  {name:"sleep",label:"Sleep (Duration)",type:"workflow_sleep",category:"workflow",description:"Pauses workflow for specified milliseconds or dynamic duration function.",inputs:[{label:"Duration (ms)",name:"duration",type:"number"},{label:"Dynamic Duration Fn",name:"fn",type:"function"}]},
  {name:"sleep_until",label:"Sleep Until (Date)",type:"workflow_sleep_until",category:"workflow",description:"Pauses workflow until a specific date/time or dynamic date function.",inputs:[{label:"Date",name:"date",type:"Date"},{label:"Dynamic Date Fn",name:"fn",type:"function"}]},
];
catalog.push(...wf.map(n => ({...n, source:"mastra"})));
catalog.push({name:"workflow",label:"Workflow",type:"workflow",category:"workflow",description:"Top-level workflow container with createWorkflow(). Typed schemas, state, events, tracing.",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"Input Schema",name:"inputSchema",type:"schema"},{label:"Output Schema",name:"outputSchema",type:"schema"},{label:"State Schema",name:"stateSchema",type:"schema"}]});
catalog.push({name:"workflow_processor",label:"Processor Workflow",type:"workflow",category:"workflow",description:"A processor-type workflow running as agent input/output pipeline.",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"Type",name:"type",type:"processor"}]});
catalog.push({name:"agent",label:"Agent",type:"agent",category:"agent",description:"LLM-powered agent with instructions, tools, memory, voice, structured output, delegation, streaming. Usable as workflow step.",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"Instructions",name:"instructions",type:"string"},{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Tools",name:"tools",type:"Tool[]"},{label:"Memory",name:"memory",type:"MastraMemory"},{label:"Voice",name:"voice",type:"MastraVoice"},{label:"Max Steps",name:"maxSteps",type:"number"},{label:"Output Schema",name:"output",type:"schema"}]});
catalog.push({name:"agent_network",label:"Agent Network",type:"agent_network",category:"agent",description:"Multi-agent network delegating tasks via routing agent. Streaming, delegation hooks, task-complete detection.",source:"mastra",inputs:[{label:"Agents",name:"agents",type:"Agent[]"},{label:"Routing Model",name:"model",type:"MastraLanguageModel"},{label:"Instructions",name:"instructions",type:"string"}]});
catalog.push({name:"tool",label:"Tool",type:"tool",category:"tool",description:"Type-safe tool with createTool(). Input/output/suspend/resume schemas, execute, approval, MCP, provider options.",source:"mastra",inputs:[{label:"ID",name:"id",type:"string"},{label:"Description",name:"description",type:"string"},{label:"Input Schema",name:"inputSchema",type:"schema"},{label:"Output Schema",name:"outputSchema",type:"schema"},{label:"Require Approval",name:"requireApproval",type:"boolean"}]});
catalog.push({name:"tool_step",label:"Tool Step",type:"tool_step",category:"tool",description:"Tool promoted to workflow step (ToolStep) with inputSchema + outputSchema.",source:"mastra",inputs:[{label:"Tool",name:"tool",type:"Tool"},{label:"Input Schema",name:"inputSchema",type:"schema"},{label:"Output Schema",name:"outputSchema",type:"schema"}]});
catalog.push({name:"tool_call_step",label:"Tool Call Step (Agentic)",type:"tool_call_step",category:"tool",description:"Internal agentic loop step executing a single LLM tool call via createToolCallStep().",source:"mastra",inputs:[{label:"Tool Set",name:"tools",type:"ToolSet"},{label:"Output Schema",name:"output",type:"schema"}]});
const procs = [
  {name:"processor_moderation",label:"Moderation Processor",description:"Detects harmful/unsafe content using LLM-based moderation model.",inputs:[{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Threshold",name:"threshold",type:"number"}]},
  {name:"processor_pii_detector",label:"PII Detector",description:"Detects and optionally redacts PII (emails, phones, SSNs) from messages.",inputs:[{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Categories",name:"categories",type:"PIICategories"}]},
  {name:"processor_prompt_injection",label:"Prompt Injection Detector",description:"Detects prompt injection and jailbreak attempts via LLM scorer.",inputs:[{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Threshold",name:"threshold",type:"number"}]},
  {name:"processor_language_detector",label:"Language Detector",description:"Detects language of incoming messages and optionally translates them.",inputs:[{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Target Language",name:"targetLanguage",type:"string"}]},
  {name:"processor_structured_output",label:"Structured Output",description:"Ensures agent output conforms to a Zod/JSON schema.",inputs:[{label:"Output Schema",name:"schema",type:"schema"}]},
  {name:"processor_batch_parts",label:"Batch Parts",description:"Batches streaming text parts into larger chunks before forwarding.",inputs:[{label:"Batch Size",name:"batchSize",type:"number"}]},
  {name:"processor_token_limiter",label:"Token Limiter",description:"Limits token count sent to model by truncating or summarizing history.",inputs:[{label:"Max Tokens",name:"maxTokens",type:"number"}]},
  {name:"processor_system_prompt_scrubber",label:"System Prompt Scrubber",description:"Detects and blocks attempts to extract or leak the system prompt.",inputs:[{label:"Model",name:"model",type:"MastraLanguageModel"}]},
  {name:"processor_unicode_normalizer",label:"Unicode Normalizer",description:"Normalizes Unicode text (NFC/NFD/NFKC/NFKD) to prevent homoglyph attacks.",inputs:[{label:"Form",name:"form",type:"string"}]},
  {name:"processor_tool_call_filter",label:"Tool Call Filter",description:"Filters or blocks specific tool calls based on allow/deny lists.",inputs:[{label:"Allow List",name:"allow",type:"string[]"},{label:"Deny List",name:"deny",type:"string[]"}]},
  {name:"processor_tool_search",label:"Tool Search",description:"Dynamically selects relevant tools via semantic search over tool descriptions.",inputs:[{label:"Max Tools",name:"maxTools",type:"number"}]},
  {name:"processor_skills",label:"Skills Processor",description:"Injects workspace skill tools into the agent tool set based on context.",inputs:[]},
  {name:"processor_workspace_instructions",label:"Workspace Instructions",description:"Prepends workspace-level instructions to the agent system prompt.",inputs:[]},
];
catalog.push(...procs.map(p => ({...p, type:"processor", category:"processor", source:"mastra"})));
catalog.push({name:"scorer",label:"Scorer (Eval)",type:"scorer",category:"eval",description:"Reusable evaluation scorer for agent responses. Prompt-based (LLM-as-judge) or custom functions.",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"Description",name:"description",type:"string"},{label:"Model",name:"model",type:"MastraLanguageModel"},{label:"Schema",name:"schema",type:"schema"}]});
catalog.push({name:"voice_speak",label:"Voice Speak (TTS)",type:"voice",category:"voice",description:"Text-to-speech provider converting text into audio stream.",source:"mastra",inputs:[{label:"Speech Model",name:"speechModel",type:"string"},{label:"Speaker",name:"speaker",type:"string"}]});
catalog.push({name:"voice_listen",label:"Voice Listen (STT)",type:"voice",category:"voice",description:"Speech-to-text provider converting audio into text.",source:"mastra",inputs:[{label:"Listening Model",name:"listeningModel",type:"string"}]});
catalog.push({name:"voice_composite",label:"Composite Voice",type:"voice",category:"voice",description:"Combines separate TTS and STT providers into a single voice interface.",source:"mastra",inputs:[{label:"Speak Provider",name:"speakProvider",type:"MastraVoice"},{label:"Listen Provider",name:"listenProvider",type:"MastraVoice"}]});
catalog.push({name:"memory",label:"Memory",type:"memory",category:"memory",description:"Persistent conversation memory with optional working memory and semantic vector recall.",source:"mastra",inputs:[{label:"Storage",name:"storage",type:"MastraStorage"},{label:"Vector Store",name:"vector",type:"MastraVector"},{label:"Working Memory",name:"workingMemory",type:"WorkingMemoryConfig"}]});
catalog.push({name:"mcp_server",label:"MCP Server",type:"mcp",category:"integration",description:"Model Context Protocol server exposing tools/resources/prompts over MCP (stdio or SSE).",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"Transport",name:"transport",type:"stdio | sse"},{label:"Tools",name:"tools",type:"Tool[]"}]});
catalog.push({name:"mcp_client",label:"MCP Client (Tool Provider)",type:"mcp",category:"integration",description:"Connects to external MCP server and imports its tools.",source:"mastra",inputs:[{label:"Server URL",name:"url",type:"string"},{label:"Transport",name:"transport",type:"stdio | sse"}]});
catalog.push({name:"integration",label:"Integration",type:"integration",category:"integration",description:"Base integration class bundling tools and workflows from an external service.",source:"mastra",inputs:[{label:"Name",name:"name",type:"string"},{label:"API Client",name:"apiClient",type:"object"}]});
catalog.push({name:"openapi_toolset",label:"OpenAPI Toolset",type:"integration",category:"integration",description:"Generates Mastra tools from an OpenAPI spec. Each operation becomes a callable tool.",source:"mastra",inputs:[{label:"Spec URL or Path",name:"spec",type:"string"},{label:"Base URL",name:"baseUrl",type:"string"}]});
const SL = {astra:"DataStax Astra",chroma:"Chroma",clickhouse:"ClickHouse",cloudflare:"Cloudflare Vectorize (Workers)","cloudflare-d1":"Cloudflare D1",convex:"Convex",couchbase:"Couchbase",duckdb:"DuckDB",dynamodb:"DynamoDB",elasticsearch:"Elasticsearch",lance:"LanceDB",libsql:"LibSQL (Turso)",mongodb:"MongoDB Atlas",mssql:"Microsoft SQL Server",opensearch:"OpenSearch",pg:"PostgreSQL (pgvector)",pinecone:"Pinecone",qdrant:"Qdrant",s3vectors:"Amazon S3 Vectors",turbopuffer:"Turbopuffer",upstash:"Upstash Vector",vectorize:"Cloudflare Vectorize"};
if (existsSync(STORES)) {
  for (const d of readdirSync(STORES).filter(x => !x.startsWith("_") && !x.startsWith(".")).sort()) {
    const lb = SL[d] || toLabel(d);
    catalog.push({name:"vector_store_"+d.replace(/-/g,"_"),label:lb,type:"vector_store",category:"storage",description:"Vector store backend: "+lb+". Implements MastraVector for similarity search, upsert, and delete.",source:"mastra",inputs:[{label:"Connection Config",name:"connectionConfig",type:"object"}]});
  }
}
const ht = safeRead(join(CORE,"harness","tools.ts"));
const re = /createTool\(\{\s*id:\s*"([^"]+)",?\s*description:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(ht)) !== null) {
  catalog.push({name:"harness_"+m[1].replace(/-/g,"_"),label:toLabel(m[1]),type:"harness_tool",category:"harness",description:m[2],source:"mastra",inputs:[]});
}
catalog.push({name:"a2a_client",label:"A2A Client",type:"a2a",category:"integration",description:"Google Agent-to-Agent protocol client. Sends JSON-RPC tasks to a remote A2A agent.",source:"mastra",inputs:[{label:"Agent URL",name:"url",type:"string"},{label:"Agent Card",name:"agentCard",type:"AgentCard"}]});
  const outPath = join(APP_ROOT, "src/lib/mastra-node-catalog.json");
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), "utf-8");
  cliLog("Wrote " + catalog.length + " node definitions to " + outPath);
  const cats = {};
  for (const n of catalog) cats[n.category] = (cats[n.category] || 0) + 1;
  cliLog("\nCategory breakdown:");
  for (const [c, v] of Object.entries(cats).sort((a, b) => b[1] - a[1])) cliLog("  " + c + ": " + v);
} catch (e) {
  cliErr("extract-mastra-nodes:", e instanceof Error ? e.message : e);
  process.exit(1);
}
