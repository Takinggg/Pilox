/**
 * Publish readiness: schema-level buyer item validation + semantic checks +
 * optional Agent Card / manifest cross-check (SSRF-hardened fetches).
 */

import { validateBuyerInputItems } from "./buyer-config.mjs";
import { fetchJsonWithSsrfGuard } from "./registry-ssrf-fetch.mjs";
import { verifyPublishAttestationHmac } from "./registry-publish-hmac.mjs";

/**
 * @typedef {{ code: string; message: string; path?: string; severity: "error" | "warning" }} PublishIssue
 */

const FETCH_CACHE_TTL_MS = Math.min(
  300_000,
  Math.max(0, Number(process.env.REGISTRY_PUBLISH_FETCH_CACHE_TTL_MS) || 60_000)
);
const FETCH_CACHE_MAX = Math.min(
  5000,
  Math.max(16, Number(process.env.REGISTRY_PUBLISH_FETCH_CACHE_MAX) || 500)
);

/** @type {Map<string, { at: number; result: Promise<{ ok: true; json: unknown; finalUrl: string } | { ok: false; error: string }> }>} */
const inflight = new Map();
/** @type {Map<string, { at: number; settled: { ok: true; json: unknown; finalUrl: string } | { ok: false; error: string } }>} */
const settledCache = new Map();

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @param {string[] | undefined} hostAllowlist
 */
function cachedFetchJson(url, timeoutMs, hostAllowlist) {
  const now = Date.now();
  const hit = settledCache.get(url);
  if (hit && now - hit.at < FETCH_CACHE_TTL_MS) {
    return Promise.resolve(hit.settled);
  }
  let p = inflight.get(url);
  if (!p) {
    p = {
      at: now,
      result: fetchJsonWithSsrfGuard(url, { timeoutMs, hostAllowlist }).then((res) => {
        inflight.delete(url);
        settledCache.set(url, { at: Date.now(), settled: res });
        if (settledCache.size > FETCH_CACHE_MAX) {
          const oldest = [...settledCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) settledCache.delete(oldest[0]);
        }
        return res;
      }),
    };
    inflight.set(url, p);
  }
  return p.result;
}

/**
 * @param {unknown} card
 * @returns {unknown | null}
 */
function manifestFromAgentCard(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const c = /** @type {Record<string, unknown>} */ (card);
  const meta = c.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = /** @type {Record<string, unknown>} */ (meta);
    const embedded = m.hiveAgentManifest ?? m.hiveManifest;
    if (embedded && typeof embedded === "object" && !Array.isArray(embedded)) return embedded;
    const url = m.hiveManifestUrl ?? m.manifestUrl;
    if (typeof url === "string" && url.trim()) return { __fetchUrl: url.trim() };
  }
  return null;
}

/**
 * @param {unknown} manifest
 * @returns {string[]}
 */
function envVarsRequiredFromManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return [];
  const m = /** @type {Record<string, unknown>} */ (manifest);
  if (m.__fetchUrl) return [];
  const rt = m.runtime;
  if (!rt || typeof rt !== "object" || Array.isArray(rt)) return [];
  const r = /** @type {Record<string, unknown>} */ (rt);
  const ev = r.envVarsRequired;
  if (!Array.isArray(ev)) return [];
  return ev.filter((x) => typeof x === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(x));
}

/**
 * @param {unknown} record
 * @param {{
 *   requireAttestation: boolean;
 *   fetchAgentCard: boolean;
 *   agentCardTimeoutMs: number;
 *   manifestUrlTimeoutMs: number;
 *   hmacSecret?: string;
 *   fetchHostAllowlist?: string[];
 * }} opts
 * @returns {Promise<{ ok: boolean; issues: PublishIssue[]; hints: string[]; manifestEnvRequired: string[] }>}
 */
export async function evaluatePublishReadiness(record, opts) {
  /** @type {PublishIssue[]} */
  const issues = [];
  /** @type {string[]} */
  const hints = [];
  /** @type {string[]} */
  let manifestEnvRequired = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    issues.push({
      code: "invalid_record",
      message: "Record must be an object",
      severity: "error",
    });
    return { ok: false, issues, hints, manifestEnvRequired };
  }

  const rec = /** @type {Record<string, unknown>} */ (record);

  if (opts.requireAttestation) {
    const a = rec.publishAttestation;
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      issues.push({
        code: "publish_attestation_required",
        message:
          "publishAttestation is required: set { confirmedAt: ISO8601, confirmedBuyerConfiguration: true } after reviewing buyer configuration in your publishing UI.",
        path: "/publishAttestation",
        severity: "error",
      });
    } else {
      const pa = /** @type {Record<string, unknown>} */ (a);
      if (pa.confirmedBuyerConfiguration !== true) {
        issues.push({
          code: "publish_attestation_incomplete",
          message: "publishAttestation.confirmedBuyerConfiguration must be true once the publisher validated the configuration checklist.",
          path: "/publishAttestation/confirmedBuyerConfiguration",
          severity: "error",
        });
      }
      if (typeof pa.confirmedAt !== "string" || !pa.confirmedAt.trim()) {
        issues.push({
          code: "publish_attestation_missing_time",
          message: "publishAttestation.confirmedAt must be an ISO 8601 date-time.",
          path: "/publishAttestation/confirmedAt",
          severity: "error",
        });
      } else if (Number.isNaN(Date.parse(pa.confirmedAt))) {
        issues.push({
          code: "publish_attestation_bad_time",
          message: "publishAttestation.confirmedAt is not a valid date-time.",
          path: "/publishAttestation/confirmedAt",
          severity: "error",
        });
      }
    }
  }

  if (opts.hmacSecret) {
    const vr = verifyPublishAttestationHmac(rec, opts.hmacSecret);
    if (!vr.ok) {
      issues.push({
        code: "publish_attestation_hmac_invalid",
        message: `HMAC verification failed (${vr.reason}). Compute SHA-256 HMAC over stable JSON of { handle, updatedAt, buyerInputs } with REGISTRY_PUBLISH_ATTESTATION_HMAC_SECRET; set publishAttestation.hmacSha256Hex.`,
        path: "/publishAttestation/hmacSha256Hex",
        severity: "error",
      });
    }
  }

  const buyerInputs = Array.isArray(rec.buyerInputs) ? rec.buyerInputs : [];
  const vrItems = validateBuyerInputItems(buyerInputs);
  if (!vrItems.ok) {
    for (const e of vrItems.errors) {
      issues.push({
        code: "buyer_input_schema",
        message: `buyerInputs[${e.index}] JSON Schema: ${e.message} @ ${e.instancePath}`,
        path: e.index >= 0 ? `/buyerInputs/${e.index}` : "/buyerInputs",
        severity: "error",
      });
    }
  }

  const envish = new Set(["env", "secret", "url"]);
  /** @type {Set<string>} */
  const documentedKeys = new Set();
  for (let i = 0; i < buyerInputs.length; i++) {
    const raw = buyerInputs[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({
        code: "buyer_input_invalid",
        message: `buyerInputs[${i}] must be an object`,
        path: `/buyerInputs/${i}`,
        severity: "error",
      });
      continue;
    }
    const inp = /** @type {Record<string, unknown>} */ (raw);
    const label = typeof inp.label === "string" ? inp.label.trim() : "";
    if (!label) {
      issues.push({
        code: "buyer_input_missing_label",
        message: `buyerInputs[${i}].label is required`,
        path: `/buyerInputs/${i}/label`,
        severity: "error",
      });
    }
    const kind = typeof inp.kind === "string" ? inp.kind : "";
    if (!["env", "secret", "url", "text", "choice"].includes(kind)) {
      issues.push({
        code: "buyer_input_invalid_kind",
        message: `buyerInputs[${i}].kind must be env | secret | url | text | choice`,
        path: `/buyerInputs/${i}/kind`,
        severity: "error",
      });
    }
    const key = typeof inp.key === "string" ? inp.key.trim() : "";
    if (envish.has(kind) && !key) {
      issues.push({
        code: "buyer_input_missing_key",
        message: `buyerInputs[${i}].key is required when kind is ${kind} (maps to container env at deploy time)`,
        path: `/buyerInputs/${i}/key`,
        severity: "error",
      });
    }
    if (key && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      issues.push({
        code: "buyer_input_bad_key",
        message: `buyerInputs[${i}].key must look like an ENV identifier (letters, numbers, underscore)`,
        path: `/buyerInputs/${i}/key`,
        severity: "error",
      });
    }
    if (key && envish.has(kind)) documentedKeys.add(key);
    if (inp.required === true) {
      const desc = typeof inp.description === "string" ? inp.description.trim() : "";
      if (desc.length < 8) {
        issues.push({
          code: "buyer_input_required_needs_description",
          message: `buyerInputs[${i}] is required=true: add a clear description (min ~8 chars) so buyers know what to provide`,
          path: `/buyerInputs/${i}/description`,
          severity: "error",
        });
      }
    }
    if (kind === "choice") {
      const options = inp.options;
      if (!Array.isArray(options) || options.length === 0) {
        issues.push({
          code: "buyer_choice_without_options",
          message: `buyerInputs[${i}] has kind choice but options[] is missing or empty`,
          path: `/buyerInputs/${i}/options`,
          severity: "error",
        });
      }
    }
  }

  if (opts.fetchAgentCard && typeof rec.agentCardUrl === "string" && rec.agentCardUrl.trim()) {
    const cardRes = await cachedFetchJson(
      rec.agentCardUrl.trim(),
      opts.agentCardTimeoutMs,
      opts.fetchHostAllowlist
    );
    if (!cardRes.ok) {
      issues.push({
        code: "agent_card_unreachable",
        message: `Could not fetch agentCardUrl for cross-check: ${cardRes.error}`,
        path: "/agentCardUrl",
        severity: "warning",
      });
      hints.push(
        "Fix Agent Card URL reachability, adjust REGISTRY_PUBLISH_FETCH_HOST_ALLOWLIST, or disable REGISTRY_PUBLISH_FETCH_AGENT_CARD."
      );
    } else {
      let manifest = manifestFromAgentCard(cardRes.json);
      if (manifest && typeof manifest === "object" && !Array.isArray(manifest) && "__fetchUrl" in manifest) {
        const u = /** @type {{ __fetchUrl: string }} */ (manifest).__fetchUrl;
        const manRes = await cachedFetchJson(u, opts.manifestUrlTimeoutMs, opts.fetchHostAllowlist);
        if (!manRes.ok) {
          issues.push({
            code: "manifest_unreachable",
            message: `Could not fetch manifest URL from Agent Card metadata: ${manRes.error}`,
            severity: "warning",
          });
        } else {
          manifest = manRes.json;
        }
      }
      manifestEnvRequired = envVarsRequiredFromManifest(manifest);
      for (const reqKey of manifestEnvRequired) {
        if (!documentedKeys.has(reqKey)) {
          issues.push({
            code: "manifest_env_not_in_buyer_inputs",
            message: `Manifest declares runtime.envVarsRequired "${reqKey}" but no buyerInputs entry documents kind env|secret|url with this key`,
            path: "/buyerInputs",
            severity: "error",
          });
        }
      }
      if (manifestEnvRequired.length === 0 && buyerInputs.length === 0) {
        hints.push("No envVarsRequired in manifest and no buyerInputs: OK for zero-config agents; otherwise add buyerInputs.");
      }
    }
  } else if (!opts.fetchAgentCard && buyerInputs.length === 0) {
    hints.push("Consider adding buyerInputs so marketplace deployers see a configuration checklist.");
  }

  const hardFail = issues.filter((x) => x.severity === "error");
  return {
    ok: hardFail.length === 0,
    issues,
    hints,
    manifestEnvRequired,
  };
}
