import { Command } from 'commander';
import { load } from 'js-yaml';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createScheduler } from './core/scheduler.js';
import { InMemoryStateManager } from './core/in-memory-state-manager.js';
import type { GitSyncConfig, SyncTaskGroup, RepoConfig } from './types/config.js';
import { GitSyncConfigSchema } from './types/config.js';
import { info, error, success } from './utils/logger.js';

const DEFAULT_CONFIG_PATH = '/app/config/git-sync.yaml';
const DEFAULT_STATE_PATH = '/app/state/state.db';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('git-sync')
    .description('Sync GitHub repos to internal Git server with author rewriting')
    .version('1.0.0');

  program
    .command('daemon')
    .description('Start the daemon scheduler')
    .option('-c, --config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
    .option('-s, --state <path>', 'State database path', DEFAULT_STATE_PATH)
    .action(async (options) => {
      const config = loadConfig(options.config);
      const stateManager = new InMemoryStateManager();
      
      const scheduler = createScheduler({
        settings: config.settings,
        syncTasks: config.sync_tasks,
        globalMappings: config.author_mappings,
        stateManager,
        getWorkDir: (repoId) => join(config.settings.repo_dir, repoId),
        onSyncComplete: (repoId: string, result: unknown) => {
          const syncResult = result as { status: string; error?: string };
          if (syncResult.status === 'success') {
            success(`${repoId} synced successfully`);
          } else {
            error(`${repoId} sync failed: ${syncResult.error}`);
          }
        },
      });

      info('Starting git-sync daemon');
      scheduler.start();

      process.on('SIGINT', () => {
        info('Received SIGINT, stopping scheduler');
        scheduler.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        info('Received SIGTERM, stopping scheduler');
        scheduler.stop();
        process.exit(0);
      });
    });

  program
    .command('sync')
    .description('Run manual sync')
    .option('-c, --config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
    .option('-r, --repo <id>', 'Sync specific repo only')
    .option('-f, --force', 'Force full sync', false)
    .action(async (options) => {
      const config = loadConfig(options.config);
      const stateManager = new InMemoryStateManager();
      
      const scheduler = createScheduler({
        settings: config.settings,
        syncTasks: config.sync_tasks,
        globalMappings: config.author_mappings,
        stateManager,
        getWorkDir: (repoId: string) => join(config.settings.repo_dir, repoId),
      });

      if (options.repo) {
        const repo = findRepo(config.sync_tasks, options.repo);
        if (!repo) {
          error(`Repo not found: ${options.repo}`);
          process.exit(1);
        }
        const result = await scheduler.runSync(repo);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const results = await scheduler.runAllSyncs();
        console.log(JSON.stringify(results, null, 2));
      }
    });

  program
    .command('status')
    .description('Show sync status')
    .option('-c, --config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
    .option('-j, --json', 'Output as JSON')
    .option('-r, --repo <id>', 'Show specific repo status')
    .action((options) => {
      const config = loadConfig(options.config);
      
      const statusData = {
        repos: config.sync_tasks.flatMap((g: SyncTaskGroup) => g.repos.map((r: RepoConfig) => ({
          id: r.id,
          group: g.name,
          branches: r.branches,
          schedule: g.schedule ?? config.settings.default_schedule,
        }))),
      };

      if (options.json) {
        console.log(JSON.stringify(statusData, null, 2));
      } else {
        console.log('Configured Repositories:');
        for (const repo of statusData.repos) {
          console.log(`  ${repo.id} (${repo.group}): ${repo.branches.join(', ')}`);
        }
      }
    });

  program
    .command('config')
    .description('Config management')
    .argument('<action>', 'show | validate')
    .option('-c, --config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
    .action((action, options) => {
      if (action === 'show') {
        const config = loadConfig(options.config);
        console.log(JSON.stringify(config, null, 2));
      } else if (action === 'validate') {
        try {
          loadConfig(options.config);
          success('Config is valid');
        } catch (err) {
          error(`Config validation failed: ${err}`);
          process.exit(1);
        }
      }
    });

  program
    .command('tui')
    .description('Start interactive TUI dashboard')
    .option('-c, --config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
    .option('-s, --state <path>', 'State database path', DEFAULT_STATE_PATH)
    .action((options) => {
      console.log('TUI requires interactive terminal. Run: npm run tui');
      console.log(`Or: tsx src/run-tui.ts ${options.config}`);
    });

  program
    .command('check-filter-repo')
    .description('Check if git-filter-repo is installed')
    .action(async () => {
      const { execa } = await import('execa');
      try {
        await execa('git-filter-repo', ['--version']);
        success('git-filter-repo is installed');
      } catch {
        error('git-filter-repo is NOT installed');
        console.log('Install with: pip install git-filter-repo');
        process.exit(1);
      }
    });

  return program;
}

function loadConfig(configPath: string): GitSyncConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const rawConfig = load(content) as Record<string, unknown>;
  
  const config = GitSyncConfigSchema.parse(rawConfig);
  return config;
}

function findRepo(syncTasks: SyncTaskGroup[], repoId: string): RepoConfig | null {
  for (const group of syncTasks) {
    const repo = group.repos.find((r: RepoConfig) => r.id === repoId);
    if (repo) {
      return repo;
    }
  }
  return null;
}

export async function runCLI(args?: string[]): Promise<void> {
  const program = createCLI();
  await program.parseAsync(args ?? process.argv);
}

if (process.argv[1]?.includes('cli')) {
  runCLI();
}