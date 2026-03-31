import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, agentGroups, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { createInstance, startInstance } from "@/lib/runtime";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.import.deploy");

// ── Zod schemas ───────────────────────────────────────────

const importedInputSchema = z.object({
  type: z.enum(["http", "webhook", "queue", "file", "cron", "agent"]),
  config: z.record(z.string(), z.unknown()),
});

const importedOutputSchema = z.object({
  type: z.enum(["http", "webhook", "queue", "file", "agent"]),
  config: z.record(z.string(), z.unknown()),
});

const importedModelSchema = z.object({
  provider: z.string(),
  name: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

const importedAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string(),
  image: z.string().min(1).max(500),
  envVars: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.unknown()),
  cpuLimit: z.string().optional(),
  memoryLimit: z.string().optional(),
  gpuEnabled: z.boolean().optional(),
  inputs: z.array(importedInputSchema).optional(),
  outputs: z.array(importedOutputSchema).optional(),
  model: importedModelSchema.optional(),
});

const importedPipelineSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["sequential", "parallel", "conditional"]),
});

const deployRequestSchema = z.object({
  source: z.enum([
    "n8n",
    "langflow",
    "flowise",
    "dify",
    "docker-compose",
    "unknown",
  ]),
  agents: z.array(importedAgentSchema).min(1),
  pipelines: z.array(importedPipelineSchema),
  models: z.array(importedModelSchema),
  groupName: z.string().max(255).optional(),
  autoStart: z.boolean().optional(),
});

// ── Route handler ─────────────────────────────────────────

/**
 * POST /api/import/deploy
 *
 * Deploy a previously parsed ImportResult.
 * Creates agents in DB and starts containers.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/import/deploy", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  try {
    const body = await req.json();
    const data = deployRequestSchema.parse(body);

    const createdAgentIds: string[] = [];
    const errors: Array<{ agent: string; error: string }> = [];

    // Create a group if requested
    let groupId: string | undefined;
    if (data.groupName) {
      const [group] = await db
        .insert(agentGroups)
        .values({
          name: data.groupName,
          description: `Imported from ${data.source}`,
          createdBy: authResult.user.id,
        })
        .returning();
      groupId = group.id;
    }

    // Create agents sequentially to handle failures individually
    for (const agentData of data.agents) {
      try {
        // Merge model config into agent config if present
        const config: Record<string, unknown> = { ...agentData.config };
        if (agentData.model) {
          config.model = {
            provider: agentData.model.provider,
            name: agentData.model.name,
            parameters: agentData.model.parameters,
          };
        }
        if (agentData.inputs) {
          config.inputs = agentData.inputs;
        }
        if (agentData.outputs) {
          config.outputs = agentData.outputs;
        }

        // Create Firecracker microVM
        const instance = await createInstance({
          name: agentData.name,
          image: agentData.image,
          envVars: agentData.envVars,
          cpuLimit: agentData.cpuLimit,
          memoryLimit: agentData.memoryLimit,
        });

        // Save to DB
        const [agent] = await db
          .insert(agents)
          .values({
            name: agentData.name,
            description: agentData.description,
            image: agentData.image,
            instanceId: instance.instanceId,
            instanceIp: instance.ipAddress,
            envVars: agentData.envVars,
            config,
            cpuLimit: agentData.cpuLimit,
            memoryLimit: agentData.memoryLimit,
            gpuEnabled: agentData.gpuEnabled,
            groupId,
            createdBy: authResult.user.id,
          })
          .returning();

        createdAgentIds.push(agent.id);

        // Auto-start the VM if requested
        if (data.autoStart) {
          try {
            await startInstance(instance.instanceId);
            await db
              .update(agents)
              .set({ status: "running", updatedAt: new Date() })
              .where(eq(agents.id, agent.id));
          } catch (startErr) {
            log.error(`Failed to auto-start agent "${agentData.name}":`, { error: startErr instanceof Error ? startErr.message : String(startErr) });
          }
        }

        // Audit log
        await db.insert(auditLogs).values({
          userId: authResult.user.id,
          action: "agent.import",
          resource: "agent",
          resourceId: agent.id,
          details: {
            name: agentData.name,
            image: agentData.image,
            source: data.source,
          },
          ipAddress: authResult.ip,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ agent: agentData.name, error: message });
        log.error(`Failed to deploy imported agent "${agentData.name}":`, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Store pipeline/relationship info in each agent's config
    if (data.pipelines.length > 0 && createdAgentIds.length > 0) {
      const createdAgents = await db
        .select()
        .from(agents)
        .where(inArray(agents.id, createdAgentIds));

      const agentNameToId = new Map<string, string>();
      for (const a of createdAgents) {
        agentNameToId.set(a.name, a.id);
      }

      // Collect all pipeline updates per agent to batch them
      const downstreamUpdates = new Map<
        string,
        Array<{ agentId: string; type: string }>
      >();
      const upstreamUpdates = new Map<
        string,
        Array<{ agentId: string; type: string }>
      >();

      for (const pipeline of data.pipelines) {
        const fromId = agentNameToId.get(pipeline.from);
        const toId = agentNameToId.get(pipeline.to);

        if (fromId && toId) {
          if (!downstreamUpdates.has(fromId)) {
            downstreamUpdates.set(fromId, []);
          }
          downstreamUpdates.get(fromId)!.push({
            agentId: toId,
            type: pipeline.type,
          });

          if (!upstreamUpdates.has(toId)) {
            upstreamUpdates.set(toId, []);
          }
          upstreamUpdates.get(toId)!.push({
            agentId: fromId,
            type: pipeline.type,
          });
        }
      }

      // Apply downstream updates
      for (const [agentId, downstream] of downstreamUpdates) {
        const agent = createdAgents.find((a) => a.id === agentId);
        if (agent) {
          const config = {
            ...((agent.config ?? {}) as Record<string, unknown>),
          };
          const existing = (config.downstream ?? []) as Array<{
            agentId: string;
            type: string;
          }>;
          config.downstream = [...existing, ...downstream];
          await db
            .update(agents)
            .set({ config, updatedAt: new Date() })
            .where(eq(agents.id, agentId));
        }
      }

      // Apply upstream updates
      for (const [agentId, upstream] of upstreamUpdates) {
        const agent = createdAgents.find((a) => a.id === agentId);
        if (agent) {
          const config = {
            ...((agent.config ?? {}) as Record<string, unknown>),
          };
          const existing = (config.upstream ?? []) as Array<{
            agentId: string;
            type: string;
          }>;
          config.upstream = [...existing, ...upstream];
          await db
            .update(agents)
            .set({ config, updatedAt: new Date() })
            .where(eq(agents.id, agentId));
        }
      }
    }

    // Audit log for the full import deployment
    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "import.deploy",
      resource: "import",
      details: {
        source: data.source,
        agentCount: data.agents.length,
        successCount: createdAgentIds.length,
        errorCount: errors.length,
        groupId,
      },
      ipAddress: authResult.ip,
    });

    return NextResponse.json(
      {
        success: true,
        createdAgentIds,
        groupId,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: data.agents.length,
          created: createdAgentIds.length,
          failed: errors.length,
          pipelines: data.pipelines.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    log.error("Import deploy error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: "Failed to deploy imported agents",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
