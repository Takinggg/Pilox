import { getRedis } from "@/lib/redis";

const KEY_PREFIX = "pilox:federation:jwt:jti";

export type ConsumeFederationJwtJtiResult =
  | { ok: true }
  | { ok: false; reason: "replay" | "redis_error" };

/**
 * Records a JWT `jti` in Redis with TTL until `exp` (+ skew). Returns failure if the id was already seen (replay).
 */
export async function consumeFederationJwtJtiOnce(
  jti: string,
  expUnix: number,
  clockSkewLeewaySeconds: number
): Promise<ConsumeFederationJwtJtiResult> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = expUnix + clockSkewLeewaySeconds - now;
  if (ttl < 1) return { ok: false, reason: "replay" };
  const capped = Math.min(ttl, 7200);
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const set = await r.set(`${KEY_PREFIX}:${jti}`, "1", "EX", capped, "NX");
    if (set !== "OK") return { ok: false, reason: "replay" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "redis_error" };
  }
}
