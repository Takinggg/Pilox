import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { apiClient, HiveApiError } from '../lib/api-client.js';

interface BackupResponse {
  id: string;
  filename: string;
  size: number;
  status: 'completed' | 'in_progress' | 'failed';
  createdAt: string;
  includes: string[];
}

interface BackupListResponse {
  backups: BackupResponse[];
  total: number;
}

interface BackupProgressResponse {
  id: string;
  status: 'in_progress' | 'completed' | 'failed';
  progress: number;
  stage: string;
  filename?: string;
  error?: string;
}

interface RestoreResponse {
  id: string;
  status: string;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
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

export function createBackupCommand(): Command {
  const cmd = new Command('backup')
    .description('Manage Hive backups');

  cmd
    .command('create')
    .description('Create a new backup')
    .option('--include <items>', 'Comma-separated items to include (db,config,agents,volumes)', 'db,config,agents')
    .option('--output <path>', 'Output directory for backup file', '/var/backups/hive')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const includes = options.include.split(',').map((s: string) => s.trim());
      const spinner = ora('Creating backup...').start();

      try {
        const { data } = await apiClient.post<BackupResponse>('/api/backups', {
          includes,
          outputDir: options.output,
        });

        // Poll for progress
        const backupId = data.id;
        let progress: BackupProgressResponse;
        let lastStage = '';

        do {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const result = await apiClient.get<BackupProgressResponse>(`/api/backups/${backupId}/status`);
          progress = result.data;

          if (progress.stage !== lastStage) {
            spinner.text = `Backup: ${progress.stage} (${progress.progress}%)`;
            lastStage = progress.stage;
          }
        } while (progress.status === 'in_progress');

        if (progress.status === 'failed') {
          spinner.fail(`Backup failed: ${progress.error ?? 'Unknown error'}`);
          process.exit(1);
        }

        spinner.succeed('Backup completed');

        if (options.json) {
          console.log(JSON.stringify(progress, null, 2));
          return;
        }

        console.log(chalk.gray(`  File: ${progress.filename}`));
        console.log(chalk.gray(`  Items: ${includes.join(', ')}`));

      } catch (err) {
        spinner.fail('Backup failed');
        handleError(err, 'create backup');
      }
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List available backups')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching backups...').start();

      try {
        const { data } = await apiClient.get<BackupListResponse>('/api/backups');
        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(data.backups, null, 2));
          return;
        }

        if (data.backups.length === 0) {
          console.log(chalk.gray('\n  No backups found.\n'));
          return;
        }

        const table = new Table({
          head: [
            chalk.white('ID'),
            chalk.white('Date'),
            chalk.white('Size'),
            chalk.white('Status'),
            chalk.white('Includes'),
          ],
          style: { head: [], border: ['gray'] },
        });

        for (const backup of data.backups) {
          const statusStr = backup.status === 'completed'
            ? chalk.green(backup.status)
            : backup.status === 'failed'
              ? chalk.red(backup.status)
              : chalk.yellow(backup.status);

          table.push([
            chalk.cyan(backup.id.substring(0, 8)),
            formatDate(backup.createdAt),
            formatBytes(backup.size),
            statusStr,
            chalk.gray(backup.includes.join(', ')),
          ]);
        }

        console.log();
        console.log(table.toString());
        console.log(chalk.gray(`\n  ${data.total} backup(s) total\n`));

      } catch (err) {
        spinner.stop();
        handleError(err, 'list backups');
      }
    });

  cmd
    .command('restore <file>')
    .description('Restore from a backup file')
    .option('--skip-db', 'Skip database restore')
    .option('--skip-config', 'Skip configuration restore')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (file: string, options) => {
      // Validate file exists
      if (!existsSync(file)) {
        console.error(chalk.red(`\n  Backup file not found: ${file}`));
        process.exit(1);
      }

      try {
        const fileStat = await stat(file);
        console.log(chalk.yellow('\n  Warning: Restoring a backup will overwrite current data.'));
        console.log(chalk.gray(`  File: ${file} (${formatBytes(fileStat.size)})`));

        if (options.skipDb) console.log(chalk.gray('  Skipping: database'));
        if (options.skipConfig) console.log(chalk.gray('  Skipping: configuration'));

        if (!options.yes) {
          // In non-interactive mode, require --yes
          console.error(chalk.red('\n  Use --yes to confirm restore in non-interactive mode.'));
          process.exit(1);
        }

        const spinner = ora('Restoring backup...').start();

        const { data } = await apiClient.post<RestoreResponse>('/api/backups/restore', {
          file,
          skipDb: options.skipDb ?? false,
          skipConfig: options.skipConfig ?? false,
        });

        // Poll for progress
        let progress: BackupProgressResponse;
        let lastStage = '';

        do {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const result = await apiClient.get<BackupProgressResponse>(`/api/backups/${data.id}/status`);
          progress = result.data;

          if (progress.stage !== lastStage) {
            spinner.text = `Restore: ${progress.stage} (${progress.progress}%)`;
            lastStage = progress.stage;
          }
        } while (progress.status === 'in_progress');

        if (progress.status === 'failed') {
          spinner.fail(`Restore failed: ${progress.error ?? 'Unknown error'}`);
          process.exit(1);
        }

        spinner.succeed('Backup restored successfully');
        console.log(chalk.gray('  Services may need to be restarted. Run: hive status'));

      } catch (err) {
        handleError(err, 'restore backup');
      }
    });

  return cmd;
}
