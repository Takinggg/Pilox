/**
 * Normalize pilox-registry-record JSON before Ajv (aliases → canonical keys).
 */

const BUYER_MERGE_KEYS = [
  "buyerInputs",
  "buyerConfiguration",
  "configurationInputs",
  "requiredInputs",
  "piloxBuyerInputs",
];

/**
 * @param {Record<string, unknown>} x
 * @param {number} idx
 * @returns {Record<string, unknown> | null}
 */
function enrichBuyerItem(x, idx) {
  const label =
    (typeof x.label === "string" && x.label.trim()) ||
    (typeof x.title === "string" && x.title.trim()) ||
    "";
  if (!label) return null;

  const key =
    (typeof x.key === "string" && x.key.trim()) ||
    (typeof x.env === "string" && x.env.trim()) ||
    (typeof x.envVar === "string" && x.envVar.trim()) ||
    "";

  let kind = typeof x.kind === "string" ? x.kind.trim().toLowerCase() : "";
  if (!kind || !["env", "secret", "url", "text", "choice"].includes(kind)) {
    if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      kind = x.secret === true || x.sensitive === true ? "secret" : "env";
    } else {
      kind = "text";
    }
  }

  const id =
    (typeof x.id === "string" && x.id.trim()) ||
    (typeof x.name === "string" && x.name.trim()) ||
    `input-${idx}`;

  const out = { ...x, id, label, kind };
  if (key) out.key = key;
  delete out.title;
  delete out.env;
  delete out.envVar;
  delete out.name;
  return out;
}

/**
 * @param {unknown[]} raw
 * @returns {Record<string, unknown>[]}
 */
function dedupeBuyerInputs(raw) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  let idx = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const x0 = /** @type {Record<string, unknown>} */ (item);
    const enriched = enrichBuyerItem(x0, idx++);
    if (!enriched) continue;
    const mergeKey =
      enriched.id ||
      (typeof enriched.key === "string" && enriched.key
        ? `key:${enriched.key}`
        : `label:${enriched.label}`);
    const prev = map.get(mergeKey);
    if (prev) {
      map.set(mergeKey, { ...prev, ...enriched });
    } else {
      map.set(mergeKey, enriched);
    }
  }
  return [...map.values()];
}

/**
 * @param {unknown} rec
 * @returns {object}
 */
export function normalizePiloxRegistryRecord(rec) {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) {
    return /** @type {object} */ (rec);
  }
  const o = /** @type {Record<string, unknown>} */ (rec);

  if (typeof o.documentationUrl !== "string" || !o.documentationUrl.trim()) {
    const d =
      (typeof o.docsUrl === "string" && o.docsUrl.trim()) ||
      (typeof o.documentation === "string" && o.documentation.trim());
    if (d) o.documentationUrl = d;
  }
  delete o.docsUrl;
  delete o.documentation;

  if (typeof o.sourceUrl !== "string" || !o.sourceUrl.trim()) {
    const s =
      (typeof o.repositoryUrl === "string" && o.repositoryUrl.trim()) ||
      (typeof o.repoUrl === "string" && o.repoUrl.trim()) ||
      (typeof o.codeUrl === "string" && o.codeUrl.trim());
    if (s) o.sourceUrl = s;
  }
  delete o.repositoryUrl;
  delete o.repoUrl;
  delete o.codeUrl;

  if (typeof o.version !== "string" || !o.version.trim()) {
    const v =
      (typeof o.revision === "string" && o.revision.trim()) ||
      (typeof o.semver === "string" && o.semver.trim());
    if (v) o.version = v;
  }
  delete o.revision;
  delete o.semver;

  if (typeof o.publishedAt !== "string" || !o.publishedAt.trim()) {
    const p =
      (typeof o.createdAt === "string" && o.createdAt.trim()) ||
      (typeof o.releaseDate === "string" && o.releaseDate.trim());
    if (p) o.publishedAt = p;
  }
  delete o.createdAt;
  delete o.releaseDate;

  if (!Array.isArray(o.inputModalities) && Array.isArray(o.input_modalities)) {
    o.inputModalities = o.input_modalities;
  }
  delete o.input_modalities;

  if (!Array.isArray(o.outputModalities) && Array.isArray(o.output_modalities)) {
    o.outputModalities = o.output_modalities;
  }
  delete o.output_modalities;

  if (o.piloxPricing !== undefined && o.pricing === undefined) {
    o.pricing = o.piloxPricing;
  }
  delete o.piloxPricing;
  delete o.pricingHint;

  const merged = [];
  for (const k of BUYER_MERGE_KEYS) {
    const v = o[k];
    if (!Array.isArray(v)) continue;
    merged.push(...v);
  }
  if (merged.length > 0) {
    o.buyerInputs = dedupeBuyerInputs(merged);
  } else if (Array.isArray(o.buyerInputs)) {
    o.buyerInputs = dedupeBuyerInputs([...o.buyerInputs]);
  }
  for (const k of BUYER_MERGE_KEYS) {
    if (k !== "buyerInputs") delete o[k];
  }

  return o;
}
