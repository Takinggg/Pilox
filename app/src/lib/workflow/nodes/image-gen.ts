// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "../../logger";
import { fetchWithTimeout } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-image-gen");

/**
 * Image generation node — generates images from text prompts.
 * Supports OpenAI DALL-E API, Stability AI, or local ComfyUI/A1111.
 */
export async function executeImageGenNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const model = node.data.model || "dall-e-3";
  const prompt = node.data.template
    ? substituteVariables(node.data.template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");
  const size = (node.data.imageSize as string) || "1024x1024";
  const provider = node.data.provider ?? "openai";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;
  let body: Record<string, unknown>;

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for image generation");
    headers["Authorization"] = `Bearer ${apiKey}`;
    url = "https://api.openai.com/v1/images/generations";
    body = { model, prompt, size, n: 1 };
  } else if (provider === "stability") {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) throw new Error("STABILITY_API_KEY required for Stability AI");
    headers["Authorization"] = `Bearer ${apiKey}`;
    url = "https://api.stability.ai/v2beta/stable-image/generate/sd3";
    body = { prompt, model, output_format: "png" };
  } else {
    // Local ComfyUI or A1111
    const localUrl = process.env.IMAGE_GEN_URL || "http://127.0.0.1:7860";
    url = `${localUrl}/sdapi/v1/txt2img`;
    body = { prompt, width: parseInt(size.split("x")[0]) || 1024, height: parseInt(size.split("x")[1]) || 1024, steps: 20 };
  }

  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body) }, timeoutMs);
  if (!res.ok) throw new Error(`Image gen "${model}" returned ${res.status}`);

  const json = await res.json();
  const imageUrl = json.data?.[0]?.url ?? json.data?.[0]?.b64_json ?? json.images?.[0] ?? null;
  variables.lastOutput = { imageUrl, prompt, model };
  return variables.lastOutput;
}
