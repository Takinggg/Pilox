import { env } from "@/lib/env";
import { authorize } from "@/lib/authorize";
import { buildA2APublicStatus } from "@/lib/a2a/public-status";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

/**
 * A2A / mesh control-plane status (no secrets). Viewer+ — same as using the dashboard.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/a2a/status", async () => {
  const auth = await authorize("viewer");
  if (!auth.authorized) return auth.response;

  return Response.json(await buildA2APublicStatus(env()));
  });
}
