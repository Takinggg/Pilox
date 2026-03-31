import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { apiClient, HiveApiError } from '../lib/api-client.js';

const CONFIG_PATH = '/etc/hive/hive.conf';

interface ConfigEntry {
  section: string;
  key: string;
  value: string;
}

interface ParsedConfig {
  sections: Map<string, Map<string, string>>;
  raw: string;
}

async function parseConfigFile(): Promise<ParsedConfig> {
  const sections = new Map<string, Map<string, string>>();
  let raw = '';

  if (!existsSync(CONFIG_PATH)) {
    return { sections, raw };
  }

  try {
    raw = await readFile(CONFIG_PATH, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read config file: ${err instanceof Error ? err.message : String(err)}`);
  }

  let currentSection = 'general';
  sections.set(currentSection, new Map());

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, new Map());
      }
      continue;
    }

    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      sections.get(currentSection)!.set(key, value);
    }
  }

  return { sections, raw };
}

function flattenConfig(sections: Map<string, Map<string, string>>): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  for (const [section, kvs] of sections) {
    for (const [key, value] of kvs) {
      entries.push({ section, key, value });
    }
  }
  return entries;
}

function resolveKey(input: string): { section: string; key: string } {
  if (input.includes('.')) {
    const dotIndex = input.indexOf('.');
    return {
      section: input.substring(0, dotIndex),
      key: input.substring(dotIndex + 1),
    };
  }
  return { section: 'general', key: input };
}

async function writeConfigValue(section: string, key: string, value: string): Promise<void> {
  let raw = '';
  if (existsSync(CONFIG_PATH)) {
    raw = await readFile(CONFIG_PATH, 'utf-8');
  }

  const lines = raw.split('\n');
  let currentSection = '';
  let found = false;
  let sectionExists = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const sectionMatch = trimmed.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (currentSection === section) sectionExists = true;
      continue;
    }

    if (currentSection !== section) continue;

    const kvMatch = trimmed.match(/^([^=]+)=(.*)/);
    if (kvMatch && kvMatch[1].trim() === key) {
      lines[i] = `${key} = ${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    if (!sectionExists) {
      lines.push('', `[${section}]`);
    }
    // Find the end of the section to insert the key
    let insertIndex = lines.length;
    let inSection = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const sectionMatch = trimmed.match(/^\[(.+)]$/);
      if (sectionMatch) {
        if (inSection) {
          insertIndex = i;
          break;
        }
        if (sectionMatch[1].trim() === section) {
          inSection = true;
        }
      }
    }
    lines.splice(insertIndex, 0, `${key} = ${value}`);
  }

  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(CONFIG_PATH, lines.join('\n'), 'utf-8');
}

export function createConfigCommand(): Command {
  const cmd = new Command('config')
    .description('Manage Hive configuration');

  cmd
    .command('get [key]')
    .description('Get configuration value(s). Use section.key notation (e.g., network.hostname)')
    .option('-j, --json', 'Output as JSON')
    .action(async (key: string | undefined, options) => {
      try {
        const config = await parseConfigFile();
        const entries = flattenConfig(config.sections);

        if (key) {
          const { section, key: configKey } = resolveKey(key);
          const sectionMap = config.sections.get(section);

          if (!sectionMap || !sectionMap.has(configKey)) {
            // Fallback: try the API
            try {
              const { data } = await apiClient.get<{ value: string }>(`/api/config/${key}`);
              console.log(data.value);
              return;
            } catch {
              console.error(chalk.red(`  Key not found: ${key}`));
              process.exit(1);
            }
          }

          const value = sectionMap.get(configKey)!;
          if (options.json) {
            console.log(JSON.stringify({ section, key: configKey, value }));
          } else {
            console.log(value);
          }
          return;
        }

        // Show all config
        if (options.json) {
          const obj: Record<string, Record<string, string>> = {};
          for (const [section, kvs] of config.sections) {
            obj[section] = Object.fromEntries(kvs);
          }
          console.log(JSON.stringify(obj, null, 2));
          return;
        }

        const table = new Table({
          head: [
            chalk.white('Section'),
            chalk.white('Key'),
            chalk.white('Value'),
          ],
          style: { head: [], border: ['gray'] },
        });

        for (const entry of entries) {
          table.push([
            chalk.cyan(entry.section),
            entry.key,
            chalk.yellow(entry.value),
          ]);
        }

        console.log();
        console.log(chalk.bold(' Hive Configuration'));
        console.log(chalk.gray(` File: ${CONFIG_PATH}\n`));
        console.log(table.toString());
        console.log();
      } catch (err) {
        console.error(chalk.red(`  Error reading config: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value. Use section.key notation (e.g., network.hostname)')
    .option('--restart', 'Restart affected services after change')
    .action(async (key: string, value: string, options) => {
      const { section, key: configKey } = resolveKey(key);

      try {
        await writeConfigValue(section, configKey, value);
        console.log(chalk.green(`  Set ${chalk.cyan(`${section}.${configKey}`)} = ${chalk.yellow(value)}`));

        // Notify the API about the config change
        try {
          await apiClient.post('/api/config/reload', { section, key: configKey, value });
          console.log(chalk.gray('  Configuration reloaded in Hive.'));
        } catch (err) {
          if (err instanceof HiveApiError && err.code !== 'CONNECTION_REFUSED') {
            console.log(chalk.yellow('  Warning: Could not notify Hive API of config change.'));
          }
          // If API is not running, that's fine — config is written to file
        }

        if (options.restart) {
          console.log(chalk.gray('  Restarting services...'));
          try {
            await apiClient.post('/api/system/restart-services', { section });
            console.log(chalk.green('  Services restarted.'));
          } catch {
            console.log(chalk.yellow('  Could not restart services via API. Try: sudo systemctl restart hive-app'));
          }
        }

      } catch (err) {
        console.error(chalk.red(`  Error writing config: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  return cmd;
}
