import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { apiClient, HiveApiError } from '../lib/api-client.js';

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  channel: 'stable' | 'beta' | 'nightly';
  releaseDate?: string;
  changelog?: ChangelogEntry[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'breaking' | 'security';
    description: string;
  }[];
}

interface UpdateProgress {
  status: 'downloading' | 'installing' | 'migrating' | 'restarting' | 'completed' | 'failed';
  progress: number;
  stage: string;
  error?: string;
}

function changeTypeLabel(type: string): string {
  switch (type) {
    case 'feature': return chalk.green('[feature]');
    case 'fix': return chalk.blue('[fix]');
    case 'breaking': return chalk.red('[breaking]');
    case 'security': return chalk.yellow('[security]');
    default: return chalk.gray(`[${type}]`);
  }
}

function handleError(err: unknown, action: string): void {
  if (err instanceof HiveApiError) {
    if (err.code === 'CONNECTION_REFUSED') {
      console.error(chalk.red('\n  Cannot connect to Hive API.'));
      console.error(chalk.gray('  Is the hive-app service running?\n'));
    } else {
      console.error(chalk.red(`\n  Failed to ${action}: ${err.message}`));
    }
  } else {
    console.error(chalk.red(`\n  Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
  }
  process.exit(1);
}

export function createUpdateCommand(): Command {
  const cmd = new Command('update')
    .description('Check for and apply Hive updates');

  cmd
    .command('check')
    .description('Check for available updates')
    .option('--channel <channel>', 'Update channel (stable, beta, nightly)', 'stable')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Checking for updates...').start();

      try {
        const { data } = await apiClient.get<VersionInfo>(`/api/system/updates?channel=${options.channel}`);
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        console.log();
        console.log(chalk.bold(' Hive Update Check'));
        console.log(chalk.gray(` Channel: ${data.channel}`));
        console.log();

        const table = new Table({
          style: { head: [], border: ['gray'] },
          colWidths: [18, 30],
        });

        table.push(
          ['Current version', chalk.cyan(data.current)],
          ['Latest version', data.updateAvailable ? chalk.green(data.latest) : chalk.cyan(data.latest)],
          ['Status', data.updateAvailable ? chalk.green('Update available') : chalk.gray('Up to date')],
        );

        if (data.releaseDate) {
          table.push(['Release date', chalk.gray(data.releaseDate)]);
        }

        console.log(table.toString());

        if (data.updateAvailable && data.changelog && data.changelog.length > 0) {
          console.log(chalk.bold('\n Changelog'));

          for (const release of data.changelog) {
            console.log(chalk.cyan(`\n  v${release.version}`) + chalk.gray(` (${release.date})`));

            for (const change of release.changes) {
              console.log(`    ${changeTypeLabel(change.type)} ${change.description}`);
            }
          }

          console.log(chalk.gray('\n  Run ') + chalk.white('hive update apply') + chalk.gray(' to install the update.\n'));
        } else if (!data.updateAvailable) {
          console.log(chalk.gray('\n  Your Hive installation is up to date.\n'));
        }

      } catch (err) {
        spinner.stop();
        handleError(err, 'check for updates');
      }
    });

  cmd
    .command('apply')
    .description('Download and apply the latest update')
    .option('--channel <channel>', 'Update channel', 'stable')
    .option('--version <version>', 'Specific version to install')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      // First check what's available
      const checkSpinner = ora('Checking for updates...').start();

      try {
        const { data: versionInfo } = await apiClient.get<VersionInfo>(
          `/api/system/updates?channel=${options.channel}`
        );
        checkSpinner.stop();

        if (!versionInfo.updateAvailable && !options.version) {
          console.log(chalk.gray('\n  Already running the latest version.\n'));
          return;
        }

        const targetVersion = options.version ?? versionInfo.latest;

        console.log();
        console.log(chalk.bold(' Hive Update'));
        console.log(chalk.gray(`  ${versionInfo.current} -> `) + chalk.green(targetVersion));

        // Check for breaking changes
        if (versionInfo.changelog) {
          const hasBreaking = versionInfo.changelog.some(
            r => r.changes.some(c => c.type === 'breaking')
          );
          if (hasBreaking) {
            console.log(chalk.yellow('\n  Warning: This update contains breaking changes.'));
            console.log(chalk.yellow('  Review the changelog: hive update check'));
          }
        }

        if (!options.yes) {
          console.error(chalk.red('\n  Use --yes to confirm the update in non-interactive mode.'));
          process.exit(1);
        }

        console.log();
        const updateSpinner = ora('Starting update...').start();

        const { data: updateResult } = await apiClient.post<{ id: string }>('/api/system/update', {
          version: targetVersion,
          channel: options.channel,
        });

        // Poll for progress
        let lastStage = '';
        let progress: UpdateProgress;

        do {
          await new Promise(resolve => setTimeout(resolve, 2000));

          try {
            const result = await apiClient.get<UpdateProgress>(`/api/system/update/${updateResult.id}/status`);
            progress = result.data;

            if (progress.stage !== lastStage) {
              updateSpinner.text = `Update: ${progress.stage} (${progress.progress}%)`;
              lastStage = progress.stage;
            }
          } catch {
            // API might be restarting, wait a bit
            progress = { status: 'restarting', progress: 90, stage: 'Restarting services...' };
            updateSpinner.text = 'Waiting for services to restart...';
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
        } while (progress.status !== 'completed' && progress.status !== 'failed');

        if (progress.status === 'failed') {
          updateSpinner.fail(`Update failed: ${progress.error ?? 'Unknown error'}`);
          console.log(chalk.gray('\n  The system should have rolled back automatically.'));
          console.log(chalk.gray('  Check logs: journalctl -u hive-app -n 50\n'));
          process.exit(1);
        }

        updateSpinner.succeed(`Updated to v${targetVersion}`);
        console.log(chalk.gray('  Run ') + chalk.white('hive status') + chalk.gray(' to verify.\n'));

      } catch (err) {
        checkSpinner.stop();
        handleError(err, 'apply update');
      }
    });

  return cmd;
}
