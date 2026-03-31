import { Command } from 'commander';
import chalk from 'chalk';
import { createStatusCommand } from './commands/status.js';
import { createAgentCommand } from './commands/agent.js';
import { createConfigCommand } from './commands/config.js';
import { createBackupCommand } from './commands/backup.js';
import { createUpdateCommand } from './commands/update.js';
import { createNetworkCommand } from './commands/network.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('hive')
  .description('Hive OS — Self-Hosted AI Agent Management Platform')
  .version(VERSION, '-v, --version')
  .configureHelp({
    sortSubcommands: true,
  })
  .addHelpText('beforeAll', chalk.cyan(`
  ╔══════════════════════════════════════╗
  ║          HIVE OS CLI v${VERSION}         ║
  ╚══════════════════════════════════════╝
`));

// Register commands
program.addCommand(createStatusCommand());
program.addCommand(createAgentCommand());
program.addCommand(createConfigCommand());
program.addCommand(createBackupCommand());
program.addCommand(createUpdateCommand());
program.addCommand(createNetworkCommand());

// Error handling
program.exitOverride();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof Error) {
      const commanderErr = err as Error & { code?: string };
      // Commander throws for --help and --version; those are not real errors
      if (commanderErr.code === 'commander.helpDisplayed' || commanderErr.code === 'commander.version') {
        process.exit(0);
      }
      if (commanderErr.code === 'commander.unknownCommand') {
        console.error(chalk.red(`\n  Unknown command. Run ${chalk.white('hive --help')} for usage.\n`));
        process.exit(1);
      }
    }

    console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

main();
