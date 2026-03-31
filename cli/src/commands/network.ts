import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { networkInterfaces, hostname } from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { apiClient, HiveApiError } from '../lib/api-client.js';

interface NetworkInfo {
  hostname: string;
  domain: string;
  fqdn: string;
  dns: string[];
  interfaces: InterfaceInfo[];
  listenPorts: PortInfo[];
}

interface InterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

interface PortInfo {
  port: number;
  service: string;
  protocol: string;
}

async function getDnsServers(): Promise<string[]> {
  const resolvPath = '/etc/resolv.conf';
  if (!existsSync(resolvPath)) return [];

  try {
    const content = await readFile(resolvPath, 'utf-8');
    const servers: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('nameserver')) {
        const parts = trimmed.split(/\s+/);
        if (parts[1]) servers.push(parts[1]);
      }
    }
    return servers;
  } catch {
    return [];
  }
}

async function getDomain(): Promise<string> {
  const resolvPath = '/etc/resolv.conf';
  if (!existsSync(resolvPath)) return 'local';

  try {
    const content = await readFile(resolvPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('domain') || trimmed.startsWith('search')) {
        const parts = trimmed.split(/\s+/);
        if (parts[1]) return parts[1];
      }
    }
  } catch {
    // ignore
  }

  return 'local';
}

function getLocalInterfaces(): InterfaceInfo[] {
  const ifaces = networkInterfaces();
  const result: InterfaceInfo[] = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      result.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        family: addr.family,
        mac: addr.mac,
        internal: addr.internal,
        cidr: addr.cidr,
      });
    }
  }

  return result;
}

export function createNetworkCommand(): Command {
  const cmd = new Command('network')
    .description('Show network information')
    .option('-j, --json', 'Output as JSON')
    .option('-a, --all', 'Show all interfaces including internal')
    .action(async (options) => {
      const spinner = ora('Gathering network info...').start();

      try {
        // Gather local info
        const localHostname = hostname();
        const domain = await getDomain();
        const dns = await getDnsServers();
        const interfaces = getLocalInterfaces();

        // Try to get additional info from API
        let apiInfo: Partial<NetworkInfo> = {};
        try {
          const { data } = await apiClient.get<NetworkInfo>('/api/system/network');
          apiInfo = data;
        } catch {
          // API not available, use local info only
        }

        spinner.stop();

        const effectiveHostname = apiInfo.hostname ?? localHostname;
        const effectiveDomain = apiInfo.domain ?? domain;
        const effectiveDns = apiInfo.dns ?? dns;
        const effectiveInterfaces = interfaces;

        if (options.json) {
          console.log(JSON.stringify({
            hostname: effectiveHostname,
            domain: effectiveDomain,
            fqdn: `${effectiveHostname}.${effectiveDomain}`,
            dns: effectiveDns,
            interfaces: effectiveInterfaces,
            ports: apiInfo.listenPorts ?? [],
          }, null, 2));
          return;
        }

        console.log();
        console.log(chalk.bold(' Network Information'));
        console.log();

        // General info
        const infoTable = new Table({
          style: { head: [], border: ['gray'] },
          colWidths: [16, 40],
        });

        infoTable.push(
          [chalk.white('Hostname'), chalk.cyan(effectiveHostname)],
          [chalk.white('Domain'), chalk.cyan(effectiveDomain)],
          [chalk.white('FQDN'), chalk.cyan(`${effectiveHostname}.${effectiveDomain}`)],
          [chalk.white('DNS Servers'), effectiveDns.length > 0 ? effectiveDns.join(', ') : chalk.gray('none')],
        );

        console.log(infoTable.toString());
        console.log();

        // Interfaces
        let filteredInterfaces = effectiveInterfaces;
        if (!options.all) {
          filteredInterfaces = filteredInterfaces.filter(i => !i.internal);
        }

        // Filter to IPv4 by default for cleaner display
        const ipv4Interfaces = filteredInterfaces.filter(i => i.family === 'IPv4');
        const ipv6Interfaces = filteredInterfaces.filter(i => i.family === 'IPv6');

        if (ipv4Interfaces.length > 0) {
          const ifaceTable = new Table({
            head: [
              chalk.white('Interface'),
              chalk.white('Address'),
              chalk.white('Netmask'),
              chalk.white('MAC'),
            ],
            style: { head: [], border: ['gray'] },
          });

          for (const iface of ipv4Interfaces) {
            ifaceTable.push([
              chalk.cyan(iface.name),
              chalk.bold(iface.address),
              iface.netmask,
              chalk.gray(iface.mac),
            ]);
          }

          console.log(chalk.bold(' IPv4 Interfaces'));
          console.log(ifaceTable.toString());
          console.log();
        }

        if (options.all && ipv6Interfaces.length > 0) {
          const ifaceTable6 = new Table({
            head: [
              chalk.white('Interface'),
              chalk.white('Address'),
              chalk.white('Netmask'),
            ],
            style: { head: [], border: ['gray'] },
          });

          for (const iface of ipv6Interfaces) {
            ifaceTable6.push([
              chalk.cyan(iface.name),
              iface.address,
              iface.netmask,
            ]);
          }

          console.log(chalk.bold(' IPv6 Interfaces'));
          console.log(ifaceTable6.toString());
          console.log();
        }

        // Listening ports from API
        if (apiInfo.listenPorts && apiInfo.listenPorts.length > 0) {
          const portsTable = new Table({
            head: [
              chalk.white('Port'),
              chalk.white('Service'),
              chalk.white('Protocol'),
            ],
            style: { head: [], border: ['gray'] },
          });

          for (const port of apiInfo.listenPorts) {
            portsTable.push([
              chalk.cyan(port.port.toString()),
              port.service,
              chalk.gray(port.protocol),
            ]);
          }

          console.log(chalk.bold(' Listening Ports'));
          console.log(portsTable.toString());
          console.log();
        }

        // Quick access info
        const primaryIp = ipv4Interfaces.find(i => !i.internal)?.address;
        if (primaryIp) {
          console.log(chalk.gray(' Access Hive at: ') + chalk.bold.cyan(`https://${primaryIp}:443`));
          console.log();
        }

      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  return cmd;
}
