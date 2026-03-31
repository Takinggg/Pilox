import { getPiloxA2AServer } from "@/lib/a2a/server";
import { env } from "@/lib/env";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";

/**
 * Public Agent Card discovery (A2A). No auth — card is non-secret metadata.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /.well-known/agent-card.json", async () => {
  if (!env().A2A_ENABLED) {
    return new Response(null, { status: 404 });
  }

  const server = getPiloxA2AServer();
  const card = await server.handler.getAgentCard();
  return Response.json(card, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
  });
}
