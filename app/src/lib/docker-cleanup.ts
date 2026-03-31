/**
 * Docker resource cleanup — removes volumes and dangling resources
 * associated with destroyed agent containers.
 */

import { dockerConnectionFromEnv } from "./docker";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("docker-cleanup");

/**
 * Remove the persistent data volume for an agent container.
 * Fire-and-forget — logs errors but never throws.
 */
export async function cleanupAgentVolume(instanceId: string): Promise<void> {
  const volumeName = `pilox-agent-data-${instanceId}`;
  try {
    const docker = dockerConnectionFromEnv();
    const volume = docker.getVolume(volumeName);
    await volume.remove({ force: true });
    log.info("docker_cleanup.volume_removed", { volumeName, instanceId });
  } catch (err) {
    // Volume may not exist (old agents created before volume support)
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such volume") && !msg.includes("not found")) {
      log.warn("docker_cleanup.volume_remove_failed", {
        volumeName,
        instanceId,
        error: msg,
      });
    }
  }
}
