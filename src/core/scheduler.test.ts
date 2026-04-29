import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler } from './scheduler.ts';
import { InMemoryStateManager } from './in-memory-state-manager.ts';
import type { SyncTaskGroup, RepoConfig, Settings, AuthorMapping } from '../types/config.ts';

vi.mock('cron', () => ({
  CronJob: {
    from: vi.fn().mockImplementation(({ start }) => ({
      stop: vi.fn(),
      start: start ? vi.fn() : vi.fn(),
      nextDate: vi.fn().mockReturnValue({ toJSDate: () => new Date() }),
    })),
  },
}));

vi.mock('./sync-engine.ts', () => ({
  SyncEngine: vi.fn().mockImplementation(() => ({
    sync: vi.fn().mockResolvedValue({
      repo_id: 'test-repo',
      status: 'success',
      commits_synced: 0,
      commits_rewritten: 0,
      branches_synced: ['main'],
      duration_ms: 100,
      error: null,
    }),
  })),
}));

vi.mock('../utils/logger.ts', () => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

describe('Scheduler', () => {
  let stateManager: InMemoryStateManager;
  let settings: Settings;
  let syncTasks: SyncTaskGroup[];
  let globalMappings: AuthorMapping[];

  beforeEach(() => {
    vi.clearAllMocks();
    stateManager = new InMemoryStateManager();
    
    settings = {
      state_dir: '/app/state',
      repo_dir: '/app/repos',
      log_level: 'INFO',
      max_concurrent: 5,
      default_schedule: '0 0 */7 * *',
      timezone: 'Asia/Shanghai',
    };
    
    const repoConfig: RepoConfig = {
      id: 'test-repo',
      github_url: 'git@github.com:org/repo.git',
      internal_url: 'git@git.internal.corp:repo.git',
      branches: ['main'],
      auth: { type: 'ssh' },
    };
    
    syncTasks = [
      {
        name: 'test-group',
        repos: [repoConfig],
      },
    ];
    
    globalMappings = [];
  });

  it('should create scheduler', () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    expect(scheduler.getJobCount()).toBe(0);
    expect(scheduler.isSchedulerRunning()).toBe(false);
  });

  it('should start and create jobs', () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    scheduler.start();
    
    expect(scheduler.getJobCount()).toBe(1);
    expect(scheduler.isSchedulerRunning()).toBe(true);
  });

  it('should stop all jobs', () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    scheduler.start();
    scheduler.stop();
    
    expect(scheduler.getJobCount()).toBe(0);
    expect(scheduler.isSchedulerRunning()).toBe(false);
  });

  it('should not start twice', () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    scheduler.start();
    scheduler.start();
    
    expect(scheduler.getJobCount()).toBe(1);
  });

  it('should run sync for repo', async () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    const repo = syncTasks[0].repos[0];
    const result = await scheduler.runSync(repo);
    
    expect(result.repo_id).toBe('test-repo');
    expect(result.status).toBe('success');
  });

  it('should run all syncs', async () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    const results = await scheduler.runAllSyncs();
    
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('success');
  });

  it('should call onSyncComplete callback', async () => {
    const callback = vi.fn();
    
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
      onSyncComplete: callback,
    });
    
    const repo = syncTasks[0].repos[0];
    await scheduler.runSync(repo);
    
    expect(callback).toHaveBeenCalledWith('test-repo', expect.any(Object));
  });

  it('should get next run time', () => {
    const scheduler = new Scheduler({
      settings,
      syncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    scheduler.start();
    
    const nextRun = scheduler.getNextRunTime('test-repo');
    expect(nextRun).not.toBeNull();
  });

  it('should use custom schedule from task group', () => {
    const customSyncTasks: SyncTaskGroup[] = [
      {
        name: 'custom-group',
        schedule: '0 2 * * *',
        repos: [{
          id: 'custom-repo',
          github_url: 'git@github.com:org/custom.git',
          internal_url: 'git@git.internal.corp:custom.git',
          branches: ['main'],
          auth: { type: 'ssh' },
        }],
      },
    ];
    
    const scheduler = new Scheduler({
      settings,
      syncTasks: customSyncTasks,
      globalMappings,
      stateManager,
      getWorkDir: () => '/test/work',
    });
    
    scheduler.start();
    
    expect(scheduler.getJobCount()).toBe(1);
  });
});