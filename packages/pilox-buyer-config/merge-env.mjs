const ENVISH_KINDS = new Set(["env", "secret", "url"]);

/**
 * @param {string[]} manifestRequired
 * @param {Record<string, unknown>[] | undefined} publisherInputs
 */
export function mergeEnvPrefillLines(manifestRequired, publisherInputs) {
  const order = [];
  const seen = new Set();
  const pushKey = (/** @type {string} */ k) => {
    const t = k.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    order.push(t);
  };
  for (const k of manifestRequired) pushKey(k);
  for (const inp of publisherInputs ?? []) {
    const key = typeof inp.key === "string" ? inp.key : "";
    const kind = typeof inp.kind === "string" ? inp.kind : "";
    if (!key || !ENVISH_KINDS.has(kind)) continue;
    pushKey(key);
  }
  return order.map((k) => `${k}=`).join("\n");
}

/**
 * @param {Record<string, unknown>[] | undefined} inputs
 */
export function publisherDeclaresEnvKeys(inputs) {
  if (!inputs?.length) return false;
  return inputs.some((i) => {
    const key = typeof i.key === "string" ? i.key : "";
    const kind = typeof i.kind === "string" ? i.kind : "";
    return Boolean(key && ENVISH_KINDS.has(kind));
  });
}
