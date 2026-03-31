/**
 * Optional external PDP over HTTP (OPA / custom) for POST /v1/records.
 * Request body: `{ "input": { "action": "registry.post_record", "handle", "record" } }` (OPA-shaped).
 * Accepted responses (200 JSON):
 * - `{ "allow": true|false, "reason"?: string }`
 * - `{ "result": true|false }` (OPA boolean decision)
 * - `{ "decision": "ALLOW"|"DENY" }` (case-insensitive)
 */

/**
 * @param {unknown} body
 * @returns {{ allow: boolean; reason?: string } | null}
 */
export function parsePdpResponseJson(body) {
  if (!body || typeof body !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (body);
  if (typeof o.allow === "boolean") {
    return {
      allow: o.allow,
      reason: typeof o.reason === "string" ? o.reason : undefined,
    };
  }
  if (typeof o.result === "boolean") {
    return { allow: o.result };
  }
  if (typeof o.decision === "string") {
    const d = o.decision.toLowerCase();
    if (d === "allow") return { allow: true };
    if (d === "deny") return { allow: false, reason: "decision_deny" };
  }
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.pdpUrl
 * @param {string} [opts.bearer]
 * @param {number} opts.timeoutMs
 * @param {boolean} opts.failOpen on transport/parse errors
 * @param {string} opts.handle
 * @param {object} opts.record
 * @returns {Promise<{ allow: boolean; reason?: string; error?: string }>}
 */
export async function consultRegistryPdp(opts) {
  const {
    pdpUrl,
    bearer = "",
    timeoutMs,
    failOpen,
    handle,
    record,
  } = opts;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    /** @type {Record<string, string>} */
    const headers = { "Content-Type": "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const res = await fetch(pdpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: {
          action: "registry.post_record",
          handle,
          record,
        },
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      if (failOpen) return { allow: true, reason: "pdp_http_error_fail_open" };
      return {
        allow: false,
        reason: "pdp_http_error",
        error: `HTTP ${res.status}`,
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (failOpen) return { allow: true, reason: "pdp_bad_json_fail_open" };
      return { allow: false, reason: "pdp_bad_json" };
    }

    const parsed = parsePdpResponseJson(json);
    if (!parsed) {
      if (failOpen) return { allow: true, reason: "pdp_unknown_shape_fail_open" };
      return { allow: false, reason: "pdp_unknown_response" };
    }
    return parsed;
  } catch (e) {
    const msg = e && typeof e === "object" && "name" in e && e.name === "AbortError"
      ? "pdp_timeout"
      : "pdp_network_error";
    if (failOpen) return { allow: true, reason: `${msg}_fail_open` };
    return { allow: false, reason: msg };
  } finally {
    clearTimeout(t);
  }
}
