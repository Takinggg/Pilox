import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { apiClient, HiveApiError } from '../lib/api-client.js';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  uptime?: number;
  memory?: number;
  cpu?: number;
  image?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentListResponse {
  agents: Agent[];
  total: number;
}

interface AgentActionResponse {
  id: string;
  status: string;
  message: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'running': return chalk.green(status);
    case 'stopped': return chalk.gray(status);
    case 'error': return chalk.red(status);
    case 'starting': return chalk.yellow(status);
    case 'stopping': return chalk.yellow(status);
    default: return chalk.white(status);
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function shortId(id: string): string {
  return id.length > 12 ? id.substring(0, 12) : id;
}

function handleError(err: unknown, action: string): void {
  if (err instanceof HiveApiError) {
    if (err.code === 'CONNECTION_REFUSED') {
      console.error(chalk.red(`\n  Cannot connect to Hive API.`));
      console.error(chalk.gray('  Is the hive-app service running?\n'));
    } else if (err.status === 404) {
      console.error(chalk.red(`\n  Agent not found.`));
    } else {
      console.error(chalk.red(`\n  Failed to ${action}: ${err.message}`));
    }
  } else {
    console.error(chalk.red(`\n  Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
  }
  process.exit(1);
}

export function createAgentCommand(): Command {
  const cmd = new Command('agent')
    .description('Manage AI agents');

  cmd
    .command('list')
    .alias('ls')
    .description('List all agents')
    .option('-a, --all', 'Show all agents including stopped')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching agents...').start();

      try {
        const { data } = await apiClient.get<AgentListResponse>('/api/agents');
        spinner.stop();

        let agents = data.agents;
        if (!options.all) {
          agents = agents.filter(a => a.status !== 'stopped');
        }

        if (options.json) {
          console.log(JSON.stringify(agents, null, 2));
          return;
        }

        if (agents.length === 0) {
          console.log(chalk.gray('\n  No agents found.'));
          if (!options.all) {
            console.log(chalk.gray('  Use --all to show stopped agents.\n'));
          }
          return;
        }

        const table = new Table({
          head: [
            chalk.white('ID'),
            chalk.white('Name'),
            chalk.white('Type'),
            chalk.white('Status'),
            chalk.white('Uptime'),
            chalk.white('Memory'),
            chalk.white('CPU'),
          ],
          style: { head: [], border: ['gray'] },
        });

        for (const agent of agents) {
          table.push([
            chalk.cyan(shortId(agent.id)),
            agent.name,
            chalk.gray(agent.type),
            statusLabel(agent.status),
            agent.uptime ? formatUptime(agent.uptime) : '-',
            agent.memory ? formatBytes(agent.memory) : '-',
            agent.cpu !== undefined ? `${agent.cpu.toFixed(1)}%` : '-',
          ]);
        }

        console.log();
        console.log(table.toString());
        console.log(chalk.gray(`\n  ${data.total} agent(s) total, ${agents.length} shown\n`));

      } catch (err) {
        spinner.stop();
        handleError(err, 'list agents');
      }
    });

  cmd
    .command('start <id>')
    .description('Start an agent')
    .action(async (id: string) => {
      const spinner = ora(`Starting agent ${chalk.cyan(shortId(id))}...`).start();

      try {
        const { data } = await apiClient.post<AgentActionResponse>(`/api/agents/${id}/start`);
        spinner.succeed(`Agent ${chalk.cyan(shortId(id))} started. ${chalk.gray(data.message ?? '')}`);
      } catch (err) {
        spinner.fail(`Failed to start agent ${chalk.cyan(shortId(id))}`);
        handleError(err, 'start agent');
      }
    });

  cmd
    .command('stop <id>')
    .description('Stop an agent')
    .option('-f, --force', 'Force stop without graceful shutdown')
    .action(async (id: string, options) => {
      const spinner = ora(`Stopping agent ${chalk.cyan(shortId(id))}...`).start();

      try {
        const body = options.force ? { force: true } : undefined;
        const { data } = await apiClient.post<AgentActionResponse>(`/api/agents/${id}/stop`, body);
        spinner.succeed(`Agent ${chalk.cyan(shortId(id))} stopped. ${chalk.gray(data.message ?? '')}`);
      } catch (err) {
        spinner.fail(`Failed to stop agent ${chalk.cyan(shortId(id))}`);
        handleError(err, 'stop agent');
      }
    });

  cmd
    .command('restart <id>')
    .description('Restart an agent')
    .action(async (id: string) => {
      const spinner = ora(`Restarting agent ${chalk.cyan(shortId(id))}...`).start();

      try {
        const { data } = await apiClient.post<AgentActionResponse>(`/api/agents/${id}/restart`);
        spinner.succeed(`Agent ${chalk.cyan(shortId(id))} restarted. ${chalk.gray(data.message ?? '')}`);
      } catch (err) {
        spinner.fail(`Failed to restart agent ${chalk.cyan(shortId(id))}`);
        handleError(err, 'restart agent');
      }
    });

  cmd
    .command('logs <id>')
    .description('Stream agent logs')
    .option('-n, --lines <count>', 'Number of historical lines', '50')
    .option('-f, --follow', 'Follow log output', true)
    .option('--no-follow', 'Do not follow, just print recent logs')
    .action(async (id: string, options) => {
      const lines = parseInt(options.lines, 10);
      const follow = options.follow;

      console.log(chalk.gray(`Streaming logs for agent ${chalk.cyan(shortId(id))}...`));
      console.log(chalk.gray('Press Ctrl+C to stop.\n'));

      try {
        const path = `/api/agents/${id}/logs?lines=${lines}&follow=${follow}`;

        await apiClient.stream(path, (line: string) => {
          try {
            const entry = JSON.parse(line);
            const timestamp = chalk.gray(entry.timestamp ?? '');
            const level = entry.level ?? 'info';
            let levelStr: string;

            switch (level) {
              case 'error': levelStr = chalk.red('ERR'); break;
              case 'warn': levelStr = chalk.yellow('WRN'); break;
              case 'debug': levelStr = chalk.gray('DBG'); break;
              default: levelStr = chalk.blue('INF');
            }

            console.log(`${timestamp} ${levelStr} ${entry.message ?? line}`);
          } catch {
            // Not JSON, print raw
            console.log(line);
          }
        });
      } catch (err) {
        if (err instanceof HiveApiError && err.code === 'CONNECTION_REFUSED') {
          console.error(chalk.red('\n  Cannot connect to Hive API.'));
          console.error(chalk.gray('  Is the hive-app service running?\n'));
        } else if (err instanceof Error && err.name === 'AbortError') {
          console.log(chalk.gray('\n  Log stream closed.'));
        } else {
          console.error(chalk.red(`\n  Error streaming logs: ${err instanceof Error ? err.message : String(err)}`));
        }
        process.exit(1);
      }
    });

  return cmd;
}
