// SPDX-License-Identifier: BUSL-1.1
import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import {
  createModelInstance,
  listModelInstances,
  stopModelInstance,
  destroyModelInstance,
  type ModelInstanceConfig,
} from "@/lib/model-instance-manager";
import { z } from "zod";

const createSchema = z.object({
  modelName: z.string().min(1).max(512),
  displayName: z.string().min(1).max(255),
  backend: z.enum(["ollama", "vllm"]),
  quantization: z.string().default("Q4_K_M"),
  turboQuant: z.boolean().default(false),
  speculativeDecoding: z.boolean().default(false),
  speculativeModel: z.string().optional(),
  cpuOffloadGB: z.number().min(0).max(256).default(0),
  maxContextLen: z.number().min(1024).max(131072).default(8192),
  prefixCaching: z.boolean().default(false),
  vptq: z.boolean().default(false),
  gpuEnabled: z.boolean().default(false),
  parameterSize: z.string().optional(),
  family: z.string().optional(),
});

/**
 * GET /api/system/inference/instances — List all model instances
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/inference/instances", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const instances = await listModelInstances();
    return NextResponse.json({ instances });
  });
}

/**
 * POST /api/system/inference/instances — Create a new model instance
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/system/inference/instances", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    try {
      const instance = await createModelInstance({
        ...parsed.data,
        createdBy: auth.user?.id,
      } as ModelInstanceConfig);

      return NextResponse.json({ instance }, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to create instance" },
        { status: 500 },
      );
    }
  });
}

/**
 * DELETE /api/system/inference/instances — Stop or destroy an instance
 * Query params: ?id=xxx&action=stop|destroy
 */
export async function DELETE(req: Request) {
  return withHttpServerSpan(req, "DELETE /api/system/inference/instances", async () => {
    const auth = await authorize("admin");
    if (!auth.authorized) return auth.response;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action") || "stop";

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    try {
      if (action === "destroy") {
        await destroyModelInstance(id);
      } else {
        await stopModelInstance(id);
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 500 },
      );
    }
  });
}
