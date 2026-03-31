import type { Agent } from "@/db/schema";
import { stringify as stringifyYaml } from "yaml";

// ── Types ─────────────────────────────────────────────────

interface ComposeOutput {
  version: string;
  services: Record<string, ComposeService>;
  networks: Record<string, ComposeNetwork>;
  volumes?: Record<string, ComposeVolumeDefinition>;
}

interface ComposeService {
  image: string;
  container_name: string;
  environment: Record<string, string>;
  restart: string;
  networks: string[];
  ports?: string[];
  volumes?: string[];
  deploy?: {
    resources: {
      limits: {
        cpus?: string;
        memory?: string;
        devices?: Array<{
          driver: string;
          count: string;
          capabilities: string[];
        }>;
      };
    };
  };
  depends_on?: string[];
  labels?: Record<string, string>;
  command?: string | string[];
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
  };
}

interface ComposeNetwork {
  driver: string;
  name?: string;
}

interface ComposeVolumeDefinition {
  driver?: string;
  name?: string;
}

// ── Export function ────────────────────────────────────────

export function exportAsDockerCompose(
  agentsData: Agent[],
  options: {
    dependencies?: Array<{ from: string; to: string }>;
    networkName?: string;
    includeHealthcheck?: boolean;
    maskEnvVars?: boolean;
  } = {}
): string {
  const {
    dependencies = [],
    networkName = "pilox-network",
    includeHealthcheck = false,
    maskEnvVars = true,
  } = options;

  const services: Record<string, ComposeService> = {};
  const allVolumes = new Set<string>();

  // Build dependency lookup: service → depends_on[]
  const dependsOnMap = new Map<string, string[]>();
  for (const dep of dependencies) {
    const fromService = sanitizeServiceName(dep.from);
    const toService = sanitizeServiceName(dep.to);
    if (!dependsOnMap.has(toService)) {
      dependsOnMap.set(toService, []);
    }
    dependsOnMap.get(toService)!.push(fromService);
  }

  for (const agent of agentsData) {
    const serviceName = sanitizeServiceName(agent.name);

    // Environment
    let envVars = agent.envVars ?? {};
    if (maskEnvVars) {
      envVars = maskSensitiveEnvValues(envVars);
    }

    const service: ComposeService = {
      image: agent.image,
      container_name: `pilox-${serviceName}`,
      environment: envVars,
      restart: "unless-stopped",
      networks: [networkName],
      labels: {
        "pilox.managed": "true",
        "pilox.agent.name": sanitizeServiceName(agent.name),
      },
    };

    // Resource limits
    const deploy = buildDeployConfig(agent);
    if (deploy) {
      service.deploy = deploy;
    }

    // Ports from agent config
    const ports = extractPorts(agent);
    if (ports.length > 0) {
      service.ports = ports;
    }

    // Volumes from agent config
    const volumes = extractVolumes(agent);
    if (volumes.length > 0) {
      service.volumes = volumes;
      for (const v of volumes) {
        const parts = v.split(":");
        if (parts[0] && !parts[0].startsWith("/") && !parts[0].startsWith(".")) {
          allVolumes.add(parts[0]);
        }
      }
    }

    // Command from config
    const command = extractCommand(agent);
    if (command) {
      service.command = command;
    }

    // Dependencies
    const deps = dependsOnMap.get(serviceName);
    if (deps && deps.length > 0) {
      service.depends_on = deps;
    }

    // Health check
    if (includeHealthcheck) {
      service.healthcheck = {
        test: ["CMD-SHELL", "exit 0"],
        interval: "30s",
        timeout: "10s",
        retries: 3,
      };
    }

    services[serviceName] = service;
  }

  const compose: ComposeOutput = {
    version: "3.8",
    services,
    networks: {
      [networkName]: {
        driver: "bridge",
      },
    },
  };

  // Add named volumes if any
  if (allVolumes.size > 0) {
    compose.volumes = {};
    for (const vol of allVolumes) {
      compose.volumes[vol] = { driver: "local" };
    }
  }

  return stringifyYaml(compose, {
    lineWidth: 120,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });
}

// ── Helpers ───────────────────────────────────────────────

function buildDeployConfig(agent: Agent): ComposeService["deploy"] | null {
  const limits: Record<string, unknown> = {};
  let hasLimits = false;

  if (agent.cpuLimit) {
    limits.cpus = agent.cpuLimit;
    hasLimits = true;
  }

  if (agent.memoryLimit) {
    limits.memory = agent.memoryLimit;
    hasLimits = true;
  }

  if (agent.gpuEnabled) {
    limits.devices = [
      {
        driver: "nvidia",
        count: "all",
        capabilities: ["gpu"],
      },
    ];
    hasLimits = true;
  }

  if (!hasLimits) return null;

  return {
    resources: {
      limits: limits as ComposeService["deploy"] extends { resources: { limits: infer L } }
        ? L
        : never,
    },
  };
}

function extractPorts(agent: Agent): string[] {
  const config = (agent.config ?? {}) as Record<string, unknown>;
  const ports: string[] = [];

  // Check for ports in config (legacy flat keys)
  if (Array.isArray(config.ports)) {
    for (const p of config.ports) {
      if (typeof p === "string") {
        ports.push(p);
      } else if (
        typeof p === "object" &&
        p !== null &&
        "host" in p &&
        "container" in p
      ) {
        const port = p as { host: string; container: string; protocol?: string };
        const proto = port.protocol ? `/${port.protocol}` : "";
        ports.push(`${port.host}:${port.container}${proto}`);
      }
    }
  }

  // If agent has a port assigned, include it
  if (agent.port) {
    const portStr = `${agent.port}:${agent.port}`;
    if (!ports.includes(portStr)) {
      ports.push(portStr);
    }
  }

  return ports;
}

function extractVolumes(agent: Agent): string[] {
  const config = (agent.config ?? {}) as Record<string, unknown>;
  const volumes: string[] = [];

  if (Array.isArray(config.volumes)) {
    for (const v of config.volumes) {
      if (typeof v === "string") {
        volumes.push(v);
      } else if (
        typeof v === "object" &&
        v !== null &&
        "host" in v &&
        "container" in v
      ) {
        const vol = v as { host: string; container: string; mode?: string };
        const mode = vol.mode ? `:${vol.mode}` : "";
        volumes.push(`${vol.host}:${vol.container}${mode}`);
      }
    }
  }

  return volumes;
}

function extractCommand(agent: Agent): string | string[] | undefined {
  const config = (agent.config ?? {}) as Record<string, unknown>;

  if (config.command) {
    return config.command as string | string[];
  }

  return undefined;
}

function sanitizeServiceName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 63);
}

const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /private/i,
  /database.?url/i,
  /redis.?url/i,
  /dsn/i,
  /connection.?string/i,
];

/** Detect values that look like connection strings with embedded credentials */
const CONNECTION_STRING_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:]+:[^@]+@/;

function maskSensitiveEnvValues(
  envVars: Record<string, string>
): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
    const isSensitiveValue = CONNECTION_STRING_PATTERN.test(value ?? "");
    if ((isSensitiveKey || isSensitiveValue) && value) {
      masked[key] = "${" + key + "}";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
