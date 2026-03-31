import { timingSafeEqual } from "node:crypto";

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {string | null}
 */
export function readBearerToken(req) {
  const h = req.headers.authorization;
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim();
}

/**
 * @param {string} got
 * @param {string} expected
 */
export function constantTimeEqToken(got, expected) {
  if (typeof got !== "string" || typeof expected !== "string") return false;
  const A = Buffer.from(got, "utf8");
  const B = Buffer.from(expected, "utf8");
  if (A.length !== B.length || A.length === 0) return false;
  return timingSafeEqual(A, B);
}
