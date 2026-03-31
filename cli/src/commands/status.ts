import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { apiClient, HiveApiError } from '../lib/api-client.js';

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  services: {
    name: string;
    status: 'running' | 'stopped' | 'degraded' | 'unknown';
    pid?: number;
    memory?: number;
    cpu?: number;
  }[];
  agents: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
  resources: {
    cpuUsage: number;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'running': return chalk.green('*');
    case 'stopped': return chalk.red('*');
    case 'degraded': return chalk.yellow('*');
    default: return chalk.gray('?');
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'running': return chalk.green(status);
    case 'stopped': return chalk.red(status);
    case 'degraded': return chalk.yellow(status);
    default: return chalk.gray(status);
  }
}

function usageBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  let color = chalk.green;
  if (percent > 80) color = chalk.red;
  else if (percent > 60) color = chalk.yellow;

  return color('#'.repeat(filled)) + chalk.gray('-'.repeat(empty)) + ` ${percent.toFixed(1)}%`;
}

export function createStatusCommand(): Command {
  const cmd = new Command('status')
    .description('Show Hive system status')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching system status...').start();

      try {
        const { data } = await apiClient.get<HealthResponse>('/api/health');
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        // Header
        console.log();
        console.log(chalk.bold.cyan(' HIVE OS') + chalk.gray(` v${data.version}`));
        console.log(chalk.gray(` Status: `) + statusLabel(data.status) + chalk.gray(`  Uptime: ${formatUptime(data.uptime)}`));
        console.log();

        // Services table
        const servicesTable = new Table({
          head: [
            chalk.white('Service'),
            chalk.white('Status'),
            chalk.white('PID'),
            chalk.white('Memory'),
            chalk.white('CPU'),
          ],
          style: { head: [], border: ['gray'] },
          colWidths: [20, 12, 10, 14, 10],
        });

        for (const svc of data.services) {
          servicesTable.push([
            `${statusIcon(svc.status)} ${svc.name}`,
            statusLabel(svc.status),
            svc.pid?.toString() ?? '-',
            svc.memory ? formatBytes(svc.memory) : '-',
            svc.cpu !== undefined ? `${svc.cpu.toFixed(1)}%` : '-',
          ]);
        }

        console.log(chalk.bold(' Services'));
        console.log(servicesTable.toString());
        console.log();

        // Agent summary
        const agentTable = new Table({
          style: { head: [], border: ['gray'] },
          colWidths: [15, 10],
        });

        agentTable.push(
          [chalk.white('Total'), chalk.bold(data.agents.total.toString())],
          [chalk.green('Running'), chalk.green(data.agents.running.toString())],
          [chalk.gray('Stopped'), chalk.gray(data.agents.stopped.toString())],
          [chalk.red('Error'), data.agents.error > 0 ? chalk.red(data.agents.error.toString()) : '0'],
        );

        console.log(chalk.bold(' Agents'));
        console.log(agentTable.toString());
        console.log();

        // Resource usage
        const cpuPercent = data.resources.cpuUsage;
        const memPercent = (data.resources.memoryUsed / data.resources.memoryTotal) * 100;
        const diskPercent = (data.resources.diskUsed / data.resources.diskTotal) * 100;

        console.log(chalk.bold(' Resources'));
        console.log(`  CPU    ${usageBar(cpuPercent)}`);
        console.log(`  Memory ${usageBar(memPercent)}  ${formatBytes(data.resources.memoryUsed)} / ${formatBytes(data.resources.memoryTotal)}`);
        console.log(`  Disk   ${usageBar(diskPercent)}  ${formatBytes(data.resources.diskUsed)} / ${formatBytes(data.resources.diskTotal)}`);
        console.log();

      } catch (err) {
        spinner.stop();

        if (err instanceof HiveApiError) {
          if (err.code === 'CONNECTION_REFUSED') {
            console.error(chalk.red('\n  Cannot connect to Hive API.'));
            console.error(chalk.gray('  Is the hive-app service running?\n'));
            console.error(chalk.gray('  Try: sudo systemctl start hive-app'));
          } else {
            console.error(chalk.red(`\n  API Error: ${err.message}`));
          }
        } else {
          console.error(chalk.red(`\n  Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
        }
        process.exit(1);
      }
    });

  return cmd;
}
