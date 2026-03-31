import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("a2a.jsonrpc-body");

/** Default max JSON body size for A2A / federation proxy JSON-RPC (bytes). */
export const A2A_JSONRPC_DEFAULT_MAX_BODY_BYTES = 1_048_576;

/**
 * Read JSON from a Request with a hard byte cap (stream-safe when `body` is a ReadableStream).
 * Rejects via Content-Length when present; otherwise enforces the limit while reading.
 */
export async function readJsonBodyLimited(
  req: Request,
  maxBytes: number
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }
> {
  const cl = req.headers.get("content-length");
  if (cl !== null && cl !== "") {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, status: 413 };
    }
  }

  const stream = req.body;
  if (stream == null) {
    // No ReadableStream — fallback to req.text(). Rare in Web Fetch API.
    // Content-Length pre-check above already guards against known-oversized payloads;
    // this catch handles the case where CL was absent or lied.
    try {
      const text = await req.text();
      if (text.length > maxBytes) return { ok: false, status: 413 };
      if (text.length === 0) return { ok: false, status: 400 };
      const value = JSON.parse(text) as unknown;
      return { ok: true, value };
    } catch {
      return { ok: false, status: 400 };
    }
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value == null || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch((e) => {
          log.warn("Reader cancel failed after size limit", {
            error: e instanceof Error ? e.message : String(e),
          });
        });
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }

  const decoder = new TextDecoder();
  let text = "";
  for (const c of chunks) {
    text += decoder.decode(c, { stream: true });
  }
  text += decoder.decode();
  if (text.length === 0) {
    return { ok: false, status: 400 };
  }
  try {
    const value = JSON.parse(text) as unknown;
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400 };
  }
}
