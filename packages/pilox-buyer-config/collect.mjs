/**
 * Merge buyerInputs from registry record + Agent Card (marketplace catalog).
 */

const RECORD_INPUT_KEYS = [
  "buyerInputs",
  "buyerConfiguration",
  "configurationInputs",
  "requiredInputs",
  "piloxBuyerInputs",
];

const CARD_INPUT_KEYS = ["piloxBuyerInputs", "buyerInputs", "configurationInputs"];

/** @param {Record<string, unknown>} inp */
function inputMergeKey(inp) {
  const id = typeof inp.id === "string" ? inp.id : "";
  const key = typeof inp.key === "string" ? inp.key : "";
  const label = typeof inp.label === "string" ? inp.label : "";
  if (id) return `id:${id}`;
  if (key) return `key:${key}`;
  return `label:${label}`;
}

/**
 * @param {unknown} raw
 * @param {number} idx
 * @returns {Record<string, unknown> | null}
 */
function parseOne(raw, idx) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const labelRaw =
    (typeof o.label === "string" && o.label.trim()) ||
    (typeof o.title === "string" && o.title.trim()) ||
    "";
  if (!labelRaw) return null;

  const id =
    (typeof o.id === "string" && o.id.trim()) ||
    (typeof o.name === "string" && o.name.trim()) ||
    `input-${idx}`;

  const key =
    (typeof o.key === "string" && o.key.trim()) ||
    (typeof o.env === "string" && o.env.trim()) ||
    (typeof o.envVar === "string" && o.envVar.trim()) ||
    undefined;

  const sensitive = o.sensitive === true || o.secret === true;

  let kind = "text";
  if (typeof o.kind === "string") {
    const k = o.kind.toLowerCase();
    if (k === "env" || k === "secret" || k === "url" || k === "text" || k === "choice") {
      kind = k;
    }
  } else if (key && /^[A-Za-z_][A-Za-z0-9_]*$/i.test(key)) {
    kind = sensitive ? "secret" : "env";
  }

  const description =
    (typeof o.description === "string" && o.description) ||
    (typeof o.help === "string" && o.help) ||
    undefined;
  const example =
    (typeof o.example === "string" && o.example) ||
    (typeof o.sample === "string" && o.sample) ||
    undefined;
  const required = o.required === true || o.optional === false;

  let options;
  if (Array.isArray(o.options)) {
    const parsed = o.options
      .map((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return null;
        const op = /** @type {Record<string, unknown>} */ (x);
        const value =
          (typeof op.value === "string" && op.value) || (typeof op.v === "string" && op.v) || "";
        if (!value) return null;
        const lab =
          (typeof op.label === "string" && op.label) ||
          (typeof op.name === "string" && op.name) ||
          value;
        return { value, label: lab };
      })
      .filter((x) => x != null);
    if (parsed.length > 0) options = parsed;
  }

  /** @type {Record<string, unknown>} */
  const out = {
    id,
    label: labelRaw,
    kind,
    required,
  };
  if (key !== undefined) out.key = key;
  if (description !== undefined) out.description = description;
  if (example !== undefined) out.example = example;
  if (options !== undefined) out.options = options;
  return out;
}

/**
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>[]}
 */
function extractFromRecord(record) {
  const out = [];
  let idx = 0;
  for (const k of RECORD_INPUT_KEYS) {
    const v = record[k];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      const p = parseOne(item, idx++);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * @param {unknown} agentCard
 * @returns {Record<string, unknown>[]}
 */
function extractFromAgentCard(agentCard) {
  const out = [];
  let idx = 0;
  const tryObj = (/** @type {Record<string, unknown>} */ obj) => {
    for (const k of CARD_INPUT_KEYS) {
      const v = obj[k];
      if (!Array.isArray(v)) continue;
      for (const item of v) {
        const p = parseOne(item, idx++);
        if (p) out.push(p);
      }
    }
  };
  if (!agentCard || typeof agentCard !== "object" || Array.isArray(agentCard)) return out;
  const c = /** @type {Record<string, unknown>} */ (agentCard);
  const meta = c.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    tryObj(/** @type {Record<string, unknown>} */ (meta));
  }
  tryObj(c);
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @param {unknown} agentCard
 * @returns {Record<string, unknown>[]}
 */
export function collectBuyerInputs(record, agentCard) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  const add = (/** @type {Record<string, unknown>[]} */ list) => {
    for (const x of list) map.set(inputMergeKey(x), x);
  };
  if (record) add(extractFromRecord(record));
  add(extractFromAgentCard(agentCard));
  return [...map.values()];
}
