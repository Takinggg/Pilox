import type {
  ImportResult,
  ImportedAgent,
  ImportedPipeline,
} from "./types";
import { parse as parseYaml } from "yaml";

// ── Docker Compose structure types ────────────────────────

interface ComposeFile {
  version?: string;
  services?: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, ComposeVolume | null>;
}

interface ComposeService {
  image?: string;
  build?: string | { context: string; dockerfile?: string; args?: Record<string, string> };
  container_name?: string;
  command?: string | string[];
  entrypoint?: string | string[];
  environment?: Record<string, string> | string[];
  env_file?: string | string[];
  ports?: string[];
  volumes?: string[];
  networks?: string[] | Record<string, ComposeServiceNetwork | null>;
  depends_on?: string[] | Record<string, ComposeDependsOn>;
  restart?: string;
  labels?: Record<string, string> | string[];
  deploy?: ComposeDeploy;
  healthcheck?: {
    test: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  working_dir?: string;
  stdin_open?: boolean;
  tty?: boolean;
  privileged?: boolean;
  extra_hosts?: string[];
  hostname?: string;
  cap_add?: string[];
  devices?: string[];
  runtime?: string;
}

interface ComposeServiceNetwork {
  aliases?: string[];
  ipv4_address?: string;
}

interface ComposeDependsOn {
  condition?: string;
  restart?: boolean;
}

interface ComposeDeploy {
  replicas?: number;
  resources?: {
    limits?: {
      cpus?: string;
      memory?: string;
      devices?: ComposeDevice[];
    };
    reservations?: {
      cpus?: string;
      memory?: string;
      devices?: ComposeDevice[];
    };
  };
  restart_policy?: {
    condition?: string;
    delay?: string;
    max_attempts?: number;
  };
}

interface ComposeDevice {
  driver?: string;
  count?: number | string;
  capabilities?: string[];
  device_ids?: string[];
}

interface ComposeNetwork {
  driver?: string;
  external?: boolean;
  name?: string;
}

interface ComposeVolume {
  driver?: string;
  external?: boolean;
  name?: string;
}

// ── Parser ────────────────────────────────────────────────

export function parseDockerCompose(data: unknown): ImportResult {
  const warnings: string[] = [];
  const agents: ImportedAgent[] = [];
  const pipelines: ImportedPipeline[] = [];

  let compose: ComposeFile;

  if (typeof data === "string") {
    try {
      compose = parseYaml(data) as ComposeFile;
    } catch (err) {
      return {
        source: "docker-compose",
        agents: [],
        pipelines: [],
        models: [],
        warnings: [
          `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
        ],
        metadata: {},
      };
    }
  } else {
    compose = data as ComposeFile;
  }

  if (!compose.services || typeof compose.services !== "object") {
    return {
      source: "docker-compose",
      agents: [],
      pipelines: [],
      models: [],
      warnings: ["No services defined in Docker Compose file"],
      metadata: {},
    };
  }

  // Parse each service into an agent
  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (!service) continue;

    const agent = mapServiceToAgent(serviceName, service, warnings);
    agents.push(agent);
  }

  // Parse depends_on relationships into pipelines
  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (!service?.depends_on) continue;

    const dependsOn = Array.isArray(service.depends_on)
      ? service.depends_on
      : Object.keys(service.depends_on);

    for (const dep of dependsOn) {
      pipelines.push({
        from: sanitizeName(dep),
        to: sanitizeName(serviceName),
        type: "sequential",
      });
    }
  }

  return {
    source: "docker-compose",
    sourceVersion: compose.version,
    agents,
    pipelines,
    models: [],
    warnings,
    metadata: {
      composeVersion: compose.version,
      networks: compose.networks
        ? Object.keys(compose.networks)
        : [],
      volumeDefinitions: compose.volumes
        ? Object.keys(compose.volumes)
        : [],
    },
  };
}

// ── Helpers ───────────────────────────────────────────────

function mapServiceToAgent(
  serviceName: string,
  service: ComposeService,
  warnings: string[]
): ImportedAgent {
  const agentName = sanitizeName(serviceName);

  // Resolve image
  let image = service.image ?? "";
  if (!image && service.build) {
    const buildContext =
      typeof service.build === "string"
        ? service.build
        : service.build.context;
    warnings.push(
      `Service "${serviceName}" uses a build context (${buildContext}) instead of an image. ` +
        `You will need to build and push this image, then update the agent configuration.`
    );
    image = `${serviceName}:latest`;
  }

  // Parse environment variables
  const envVars = parseEnvironment(service.environment);

  // Parse resource limits
  const { cpuLimit, memoryLimit, gpuEnabled } = parseResources(service);

  // Parse volumes
  const volumeConfig = parseVolumes(service.volumes);

  // Parse ports
  const portConfig = parsePorts(service.ports);

  // env_file warning
  if (service.env_file) {
    const files = Array.isArray(service.env_file)
      ? service.env_file
      : [service.env_file];
    warnings.push(
      `Service "${serviceName}" references env_file(s): ${files.join(", ")}. ` +
        `You will need to add those variables directly to the agent's env config.`
    );
  }

  // GPU / runtime
  if (service.runtime === "nvidia" || service.devices?.some((d) => d.includes("nvidia"))) {
    warnings.push(
      `Service "${serviceName}" uses NVIDIA runtime/devices. GPU support enabled.`
    );
  }

  const config: Record<string, unknown> = {
    composeServiceName: serviceName,
    command: service.command,
    entrypoint: service.entrypoint,
    ports: portConfig,
    volumes: volumeConfig,
    networks: parseNetworks(service.networks),
    restart: service.restart,
    labels: parseLabels(service.labels),
    healthcheck: service.healthcheck,
    workingDir: service.working_dir,
    hostname: service.hostname,
  };

  // Clean undefined values from config
  for (const key of Object.keys(config)) {
    if (config[key] === undefined) {
      delete config[key];
    }
  }

  return {
    name: agentName,
    description: `Docker Compose service: ${serviceName}`,
    image,
    envVars,
    config,
    cpuLimit,
    memoryLimit,
    gpuEnabled,
    inputs: portConfig.length > 0
      ? [
          {
            type: "http" as const,
            config: { ports: portConfig },
          },
        ]
      : [],
    outputs: [],
  };
}

function parseEnvironment(
  env: ComposeService["environment"]
): Record<string, string> {
  if (!env) return {};

  if (Array.isArray(env)) {
    const result: Record<string, string> = {};
    for (const entry of env) {
      const eqIndex = entry.indexOf("=");
      if (eqIndex > 0) {
        result[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
      } else {
        result[entry] = "";
      }
    }
    return result;
  }

  // Already a record
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    result[key] = String(value ?? "");
  }
  return result;
}

function parseResources(service: ComposeService): {
  cpuLimit?: string;
  memoryLimit?: string;
  gpuEnabled: boolean;
} {
  const limits = service.deploy?.resources?.limits;
  const reservations = service.deploy?.resources?.reservations;

  let gpuEnabled = false;

  // Check for GPU devices in limits or reservations
  if (limits?.devices) {
    gpuEnabled = limits.devices.some(
      (d) => d.capabilities?.includes("gpu") || d.driver === "nvidia"
    );
  }
  if (!gpuEnabled && reservations?.devices) {
    gpuEnabled = reservations.devices.some(
      (d) => d.capabilities?.includes("gpu") || d.driver === "nvidia"
    );
  }

  // NVIDIA runtime
  if (service.runtime === "nvidia") {
    gpuEnabled = true;
  }

  return {
    cpuLimit: limits?.cpus,
    memoryLimit: limits?.memory,
    gpuEnabled,
  };
}

function parseVolumes(
  volumes?: string[]
): Array<{ host: string; container: string; mode?: string }> {
  if (!volumes) return [];

  return volumes.map((v) => {
    const parts = v.split(":");
    if (parts.length >= 2) {
      return {
        host: parts[0],
        container: parts[1],
        mode: parts[2],
      };
    }
    return { host: "", container: parts[0] };
  });
}

function parsePorts(
  ports?: string[]
): Array<{ host: string; container: string; protocol?: string }> {
  if (!ports) return [];

  return ports.map((p) => {
    const portStr = String(p);
    // Handle format: "host:container/protocol" or "container"
    const [mapping, protocol] = portStr.split("/");
    const parts = mapping.split(":");

    if (parts.length >= 2) {
      return {
        host: parts[parts.length - 2],
        container: parts[parts.length - 1],
        protocol,
      };
    }
    return { host: parts[0], container: parts[0], protocol };
  });
}

function parseNetworks(
  networks?: ComposeService["networks"]
): string[] | undefined {
  if (!networks) return undefined;

  if (Array.isArray(networks)) {
    return networks;
  }

  return Object.keys(networks);
}

function parseLabels(
  labels?: ComposeService["labels"]
): Record<string, string> | undefined {
  if (!labels) return undefined;

  if (Array.isArray(labels)) {
    const result: Record<string, string> = {};
    for (const label of labels) {
      const eqIndex = label.indexOf("=");
      if (eqIndex > 0) {
        result[label.slice(0, eqIndex)] = label.slice(eqIndex + 1);
      }
    }
    return result;
  }

  return labels;
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 255);
}

// ── Detection ─────────────────────────────────────────────

export function isDockerCompose(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Docker Compose files have a "services" key
  return typeof obj.services === "object" && obj.services !== null;
}

/**
 * Try to detect Docker Compose from a YAML string.
 */
export function isDockerComposeYaml(text: string): boolean {
  try {
    const parsed = parseYaml(text);
    return isDockerCompose(parsed);
  } catch {
    return false;
  }
}
