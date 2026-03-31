import { readFile } from "node:fs/promises";

const CONFIG_PATH = process.env.PILOX_CONFIG_PATH || "/etc/pilox/pilox.conf";

export type PiloxConfig = Record<string, Record<string, string>>;

/**
 * Parse an INI-style config file into a nested object.
 *
 * Format:
 *   [section]
 *   key = value
 *   # comments are ignored
 *
 * Returns { section: { key: value, ... }, ... }
 */
export function parseIni(content: string): PiloxConfig {
  const config: PiloxConfig = {};
  let currentSection = "global";

  const lines = content.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    // Section header: [section]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!config[currentSection]) {
        config[currentSection] = {};
      }
      continue;
    }

    // Key = Value
    const kvMatch = line.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();

      // Strip surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!config[currentSection]) {
        config[currentSection] = {};
      }
      config[currentSection][key] = value;
    }
  }

  return config;
}

/**
 * Read and parse the Pilox config file.
 * Returns the parsed config object.
 */
export async function readPiloxConfig(): Promise<PiloxConfig> {
  const content = await readFile(CONFIG_PATH, "utf-8");
  return parseIni(content);
}

/**
 * Look up a value using dot notation, e.g. "network.hostname".
 * Returns the value string or undefined if not found.
 */
export function getConfigValue(
  config: PiloxConfig,
  dotKey: string
): string | undefined {
  const parts = dotKey.split(".");

  if (parts.length < 2) {
    // No section specified; search in "global" first, then all sections
    const key = parts[0];
    if (config.global?.[key] !== undefined) {
      return config.global[key];
    }
    for (const section of Object.values(config)) {
      if (section[key] !== undefined) {
        return section[key];
      }
    }
    return undefined;
  }

  const section = parts[0];
  const key = parts.slice(1).join(".");

  return config[section]?.[key];
}

export { CONFIG_PATH };
