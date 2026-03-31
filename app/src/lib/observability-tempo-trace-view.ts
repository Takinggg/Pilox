/**
 * Parse OTLP-ish JSON from Tempo GET /api/traces/{id} (resourceSpans ou batches legacy)
 * et construit un ordre d’affichage waterfall (arbre + barres temporelles).
 */

export interface ParsedTraceSpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  serviceName: string;
  startNs: bigint;
  endNs: bigint;
}

export interface WaterfallRow {
  depth: number;
  spanId: string;
  name: string;
  serviceName: string;
  /** ms depuis le début de la trace */
  offsetMs: number;
  durationMs: number;
  /** 0–100 pour barre dans la timeline */
  leftPct: number;
  widthPct: number;
}

export interface TraceWaterfallModel {
  rows: WaterfallRow[];
  traceDurationMs: number;
}

function base64ToHex(b64: string): string | null {
  try {
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normalized);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** Identifiants OTLP JSON : hex ou base64 (8 ou 16 octets). */
export function normalizeOtelId(id: unknown): string | null {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{16}$/.test(s) || /^[0-9a-fA-F]{32}$/.test(s)) {
    return s.toLowerCase();
  }
  const fromB64 = base64ToHex(s);
  if (fromB64 && (fromB64.length === 16 || fromB64.length === 32)) {
    return fromB64;
  }
  return s.toLowerCase();
}

export function isRootParentId(id: string | null): boolean {
  if (id == null) return true;
  if (id === "") return true;
  return /^0+$/.test(id);
}

function readUnixNano(v: unknown): bigint | null {
  if (v == null) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function attrString(attrs: unknown, key: string): string {
  if (!Array.isArray(attrs)) return "";
  for (const a of attrs) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (o.key !== key) continue;
    const val = o.value;
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    if (typeof v.stringValue === "string") return v.stringValue;
    if (v.stringValue != null) return String(v.stringValue);
    if (typeof v.intValue === "string" || typeof v.intValue === "number") {
      return String(v.intValue);
    }
  }
  return "";
}

function getResourceSpansArray(data: unknown): unknown[] | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.resourceSpans)) return o.resourceSpans;
  if (Array.isArray(o.batches)) return o.batches;
  const trace = o.trace;
  if (trace && typeof trace === "object") {
    const t = trace as Record<string, unknown>;
    if (Array.isArray(t.resourceSpans)) return t.resourceSpans;
    if (Array.isArray(t.batches)) return t.batches;
  }
  return null;
}

function scopeSpansList(rs: Record<string, unknown>): unknown[] {
  if (Array.isArray(rs.scopeSpans)) return rs.scopeSpans;
  if (Array.isArray(rs.instrumentationLibrarySpans)) {
    return rs.instrumentationLibrarySpans;
  }
  return [];
}

function spansInScope(scope: Record<string, unknown>): unknown[] {
  if (Array.isArray(scope.spans)) return scope.spans;
  return [];
}

/**
 * Extrait les spans plates depuis la charge utile trace Tempo / OTLP JSON.
 */
export function parseTempoTracePayload(data: unknown): ParsedTraceSpan[] {
  const blocks = getResourceSpansArray(data);
  if (!blocks?.length) return [];

  const out: ParsedTraceSpan[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const rs = block as Record<string, unknown>;
    const resource = rs.resource;
    let serviceName = "";
    if (resource && typeof resource === "object") {
      serviceName = attrString(
        (resource as Record<string, unknown>).attributes,
        "service.name"
      );
    }

    for (const scope of scopeSpansList(rs)) {
      if (!scope || typeof scope !== "object") continue;
      for (const sp of spansInScope(scope as Record<string, unknown>)) {
        if (!sp || typeof sp !== "object") continue;
        const s = sp as Record<string, unknown>;
        const spanId = normalizeOtelId(s.spanId);
        if (!spanId) continue;
        const parentRaw = normalizeOtelId(s.parentSpanId);
        const parentSpanId =
          parentRaw && !isRootParentId(parentRaw) ? parentRaw : null;
        const name = typeof s.name === "string" ? s.name : String(s.name ?? "");
        const startNs = readUnixNano(s.startTimeUnixNano);
        const endNs = readUnixNano(s.endTimeUnixNano);
        if (startNs == null || endNs == null) continue;
        if (endNs < startNs) continue;
        out.push({
          spanId,
          parentSpanId,
          name: name || "(unnamed)",
          serviceName: serviceName || "—",
          startNs,
          endNs,
        });
      }
    }
  }

  return out;
}

function sortByStart(a: ParsedTraceSpan, b: ParsedTraceSpan): number {
  if (a.startNs < b.startNs) return -1;
  if (a.startNs > b.startNs) return 1;
  return a.spanId.localeCompare(b.spanId);
}

const NS_PER_MS = BigInt(1_000_000);
const PCT_SCALE = BigInt(10_000);

function bigAbsMs(ns: bigint): number {
  const ms = ns / NS_PER_MS;
  const n = Number(ms);
  return Number.isFinite(n) ? n : 0;
}

export interface OrderedSpanWithDepth {
  span: ParsedTraceSpan;
  depth: number;
}

/**
 * DFS : même ordre que le waterfall, avec profondeur explicite.
 */
export function orderSpansWithDepth(spans: ParsedTraceSpan[]): OrderedSpanWithDepth[] {
  if (spans.length === 0) return [];

  const idSet = new Set(spans.map((s) => s.spanId));
  const byParent = new Map<string | null, ParsedTraceSpan[]>();

  for (const sp of spans) {
    let p = sp.parentSpanId;
    if (p != null && !idSet.has(p)) p = null;
    if (isRootParentId(p)) p = null;
    const list = byParent.get(p) ?? [];
    list.push(sp);
    byParent.set(p, list);
  }

  for (const [, list] of byParent) list.sort(sortByStart);

  const ordered: OrderedSpanWithDepth[] = [];

  function walk(parent: string | null, depth: number) {
    const kids = byParent.get(parent) ?? [];
    for (const sp of kids) {
      ordered.push({ span: sp, depth });
      walk(sp.spanId, depth + 1);
    }
  }

  walk(null, 0);
  return ordered;
}

/**
 * Modèle pour la grille waterfall (lignes + pourcentages de timeline).
 */
export function buildTraceWaterfallModel(spans: ParsedTraceSpan[]): TraceWaterfallModel | null {
  if (spans.length === 0) return null;

  let minStart = spans[0]!.startNs;
  let maxEnd = spans[0]!.endNs;
  for (const s of spans) {
    if (s.startNs < minStart) minStart = s.startNs;
    if (s.endNs > maxEnd) maxEnd = s.endNs;
  }

  const traceDurationNs = maxEnd - minStart;
  const traceDurationMs = Math.max(0.001, bigAbsMs(traceDurationNs));

  const ordered = orderSpansWithDepth(spans);
  const rows: WaterfallRow[] = [];

  for (const { span: sp, depth } of ordered) {
    const offsetNs = sp.startNs - minStart;
    const durNs = sp.endNs - sp.startNs;
    const offsetMs = bigAbsMs(offsetNs);
    const durationMs = Math.max(0.001, bigAbsMs(durNs));

    let leftPct = 0;
    let widthPct = 100;
    if (traceDurationNs > BigInt(0)) {
      const left = (offsetNs * PCT_SCALE) / traceDurationNs;
      const w = (durNs * PCT_SCALE) / traceDurationNs;
      leftPct = Number(left) / 100;
      widthPct = Math.max(0.15, Number(w) / 100);
    }

    rows.push({
      depth,
      spanId: sp.spanId,
      name: sp.name,
      serviceName: sp.serviceName,
      offsetMs,
      durationMs,
      leftPct,
      widthPct,
    });
  }

  return { rows, traceDurationMs };
}

export function traceWaterfallFromPayload(data: unknown): TraceWaterfallModel | null {
  const spans = parseTempoTracePayload(data);
  return buildTraceWaterfallModel(spans);
}
