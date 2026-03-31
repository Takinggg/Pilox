import { ed25519 } from "@noble/curves/ed25519";
import { z } from "zod";
import { meshOutboundFetch } from "@/lib/otel-client-fetch";
import { stableStringify } from "@/lib/mesh-envelope";
import {
  federationEd25519PublicKeyHexValid,
} from "@/lib/mesh-federation-ed25519";
import { createModuleLogger } from "@/lib/logger";
import { hexToBytes } from "@/lib/hex";

const log = createModuleLogger("mesh.federation.manifest");

const HEX128 = /^[0-9a-fA-F]{128}$/;

/** Max response body when fetching a signed peer manifest (defense against OOM). */
export const MAX_SIGNED_FEDERATION_MANIFEST_BYTES = 2 * 1024 * 1024;

const manifestPeerEntrySchema = z.object({
  origin: z.string().min(1),
  ed25519PublicKeyHex: z.string().optional(),
});

const manifestPayloadSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().optional(),
  peers: z.array(manifestPeerEntrySchema),
});

const signedManifestSchema = z.object({
  payload: manifestPayloadSchema,
  sigHex: z.string().regex(HEX128),
});

export type ManifestPeerEntry = z.infer<typeof manifestPeerEntrySchema>;

export function verifySignedManifestBody(
  bodyUtf8: string,
  manifestSigningPublicKeyHex: string
): { ok: true; peers: ManifestPeerEntry[] } | { ok: false; reason: string } {
  if (!federationEd25519PublicKeyHexValid(manifestSigningPublicKeyHex)) {
    return { ok: false, reason: "invalid_manifest_signing_public_key" };
  }
  let parsed: z.infer<typeof signedManifestSchema>;
  try {
    const raw = JSON.parse(bodyUtf8) as unknown;
    parsed = signedManifestSchema.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_manifest_json" };
  }

  const msg = new TextEncoder().encode(stableStringify(parsed.payload));
  let sig: Uint8Array;
  let pk: Uint8Array;
  try {
    sig = hexToBytes(parsed.sigHex.trim());
    pk = hexToBytes(manifestSigningPublicKeyHex.trim());
  } catch {
    return { ok: false, reason: "invalid_hex" };
  }
  if (sig.length !== 64) {
    return { ok: false, reason: "bad_signature_length" };
  }
  try {
    if (!ed25519.verify(sig, msg, pk)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "verify_error" };
  }

  return { ok: true, peers: parsed.payload.peers };
}

export function normalizeManifestOrigin(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function readResponseTextWithByteLimit(
  r: Response,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false }> {
  const cl = r.headers.get("content-length");
  if (cl !== null && cl !== "") {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false };
    }
  }
  const stream = r.body;
  if (stream == null) {
    const text = await r.text();
    if (text.length > maxBytes) return { ok: false };
    return { ok: true, text };
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
          log.warn("Reader cancel failed after byte limit", {
            error: e instanceof Error ? e.message : String(e),
          });
        });
        return { ok: false };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false };
  }
  const decoder = new TextDecoder();
  let text = "";
  for (const c of chunks) {
    text += decoder.decode(c, { stream: true });
  }
  text += decoder.decode();
  return { ok: true, text };
}

/** Fetch manifest from a trusted URL (env-only — no caller-controlled URL). */
export async function fetchSignedFederationManifest(
  manifestUrl: string,
  manifestSigningPublicKeyHex: string,
  timeoutMs: number
): Promise<
  | { ok: true; peers: ManifestPeerEntry[] }
  | { ok: false; reason: string }
> {
  let u: URL;
  try {
    u = new URL(manifestUrl.trim());
  } catch {
    return { ok: false, reason: "bad_manifest_url" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "manifest_url_not_http" };
  }
  if (
    u.protocol === "http:" &&
    process.env.NODE_ENV !== "development"
  ) {
    return { ok: false, reason: "manifest_http_forbidden_in_production" };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "manifest_url_has_credentials" };
  }

  try {
    const r = await meshOutboundFetch(
      "mesh.federation.manifest_fetch",
      u.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    if (!r.ok) {
      return { ok: false, reason: `http_${r.status}` };
    }
    const bodyRead = await readResponseTextWithByteLimit(
      r,
      MAX_SIGNED_FEDERATION_MANIFEST_BYTES
    );
    if (!bodyRead.ok) {
      return { ok: false, reason: "manifest_too_large" };
    }
    return verifySignedManifestBody(
      bodyRead.text,
      manifestSigningPublicKeyHex
    );
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { ok: false, reason: "fetch_timeout" };
    }
    return { ok: false, reason: "fetch_error" };
  }
}
