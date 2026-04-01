// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "../../logger";
import { fetchWithTimeout } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-audio");

/**
 * Audio node — speech-to-text (transcription) or text-to-speech.
 * Supports OpenAI Whisper API, local Whisper, or TTS APIs.
 */
export async function executeAudioNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const action = (node.data.audioAction as string) || "transcribe";
  const model = node.data.model || (action === "transcribe" ? "whisper-1" : "tts-1");
  const provider = node.data.provider ?? "openai";

  const headers: Record<string, string> = {};

  if (action === "transcribe") {
    // Speech-to-text
    const audioUrl = node.data.template
      ? substituteVariables(node.data.template, variables)
      : String(variables.lastOutput ?? "");

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY required for transcription");
      headers["Authorization"] = `Bearer ${apiKey}`;

      // If input is a URL, fetch the audio first
      const audioRes = await fetchWithTimeout(audioUrl, {}, timeoutMs);
      if (!audioRes.ok) throw new Error(`Failed to fetch audio from ${audioUrl}`);
      const audioBlob = await audioRes.blob();

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", model);

      const res = await fetchWithTimeout(
        "https://api.openai.com/v1/audio/transcriptions",
        { method: "POST", headers, body: formData },
        timeoutMs,
      );
      if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
      const json = await res.json();
      variables.lastOutput = json.text ?? "";
      return variables.lastOutput;
    }

    // Local Whisper via vLLM or direct
    const whisperUrl = process.env.WHISPER_URL || process.env.VLLM_URL || "http://vllm:8000";
    const res = await fetchWithTimeout(
      `${whisperUrl}/v1/audio/transcriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, audio_url: audioUrl }),
      },
      timeoutMs,
    );
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
    const json = await res.json();
    variables.lastOutput = json.text ?? "";
    return variables.lastOutput;
  }

  // Text-to-speech
  const text = node.data.template
    ? substituteVariables(node.data.template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");
  const voice = (node.data.voice as string) || "alloy";

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for TTS");
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["Content-Type"] = "application/json";

    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/speech",
      { method: "POST", headers, body: JSON.stringify({ model, input: text, voice }) },
      timeoutMs,
    );
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    const audioBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");
    variables.lastOutput = { audio: `data:audio/mp3;base64,${base64}`, text, voice };
    return variables.lastOutput;
  }

  throw new Error(`Unsupported audio provider: ${provider}`);
}
