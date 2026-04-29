import { CronJob } from 'cron';
import type { Settings, SyncTaskGroup, RepoConfig, AuthorMapping } from '../types/config.js';
import type { SyncResult } from '../types/sync.js';
import { SyncEngine, type SyncEngineConfig } from './sync-engine.js';
import { InMemoryStateManager } from './in-memory-state-manager.js';
import { info, debug } from '../utils/logger.js';

export type SyncCompleteCallback = (repoId: string, result: SyncResult) => void;

export interface SchedulerConfig {
  settings: Settings;
  syncTasks: SyncTaskGroup[];
  globalMappings: AuthorMapping[];
  stateManager: InMemoryStateManager;
  getWorkDir: (repoId: string) => string;
  onSyncComplete?: SyncCompleteCallback;
}

export class Scheduler {
  private jobs: Map<string, CronJob> = new Map();
  private settings: Settings;
  private syncTasks: SyncTaskGroup[];
  private globalMappings: AuthorMapping[];
  private stateManager: InMemoryStateManager;
  private getWorkDir: (repoId: string) => string;
  private onSyncComplete?: SyncCompleteCallback;
  private isRunning = false;

  constructor(config: SchedulerConfig) {
    this.settings = config.settings;
    this.syncTasks = config.syncTasks;
    this.globalMappings = config.globalMappings;
    this.stateManager = config.stateManager;
    this.getWorkDir = config.getWorkDir;
    this.onSyncComplete = config.onSyncComplete;
  }

  start(): void {
    if (this.isRunning) {
      debug('Scheduler already running');
      return;
    }

    this.isRunning = true;

    for (const taskGroup of this.syncTasks) {
      const schedule = taskGroup.schedule ?? this.settings.default_schedule;
      
      for (const repo of taskGroup.repos) {
        const jobKey = `${taskGroup.name}:${repo.id}`;
        
        const job = CronJob.from({
          cronTime: schedule,
          onTick: async () => { await this.runSync(repo); },
          start: true,
          timeZone: this.settings.timezone,
        });
        
        this.jobs.set(jobKey, job);
        info(`Scheduled ${repo.id} with schedule: ${schedule}`);
      }
    }

    info(`Scheduler started with ${this.jobs.size} jobs`);
  }

  stop(): void {
    for (const [key, job] of this.jobs) {
      job.stop();
      debug(`Stopped job: ${key}`);
    }
    
    this.jobs.clear();
    this.isRunning = false;
    info('Scheduler stopped');
  }

  async runSync(repo: RepoConfig): Promise<SyncResult> {
    info(`Starting sync for ${repo.id}`);
    
    const workDir = this.getWorkDir(repo.id);
    
    const engineConfig: SyncEngineConfig = {
      repoConfig: repo,
      globalMappings: this.globalMappings,
      settings: this.settings,
      stateManager: this.stateManager,
      workDir,
    };
    
    const engine = new SyncEngine(engineConfig);
    const result = await engine.sync();
    
    if (this.onSyncComplete) {
      this.onSyncComplete(repo.id, result);
    }
    
    return result;
  }

  async runAllSyncs(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    
    for (const taskGroup of this.syncTasks) {
      for (const repo of taskGroup.repos) {
        const result = await this.runSync(repo);
        results.push(result);
      }
    }
    
    return results;
  }

  getJobCount(): number {
    return this.jobs.size;
  }

  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  getNextRunTime(repoId: string): Date | null {
    for (const [key, job] of this.jobs) {
      if (key.endsWith(`:${repoId}`)) {
        return job.nextDate().toJSDate();
      }
    }
    return null;
  }
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  return new Scheduler(config);
}