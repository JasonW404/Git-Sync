import type { RepoConfig, Settings, AuthorMapping } from '../types/config.js';
import type { SyncResult, SyncProgress } from '../types/sync.js';
import type { MergedRepoConfig } from '../types/repo.js';
import { GitOperations, prepareUrlForClone, getBranchesToSync } from './git-operations.js';
import { AuthorRewriter } from './author-rewrite.js';
import type { InMemoryStateManager } from './in-memory-state-manager.js';
import { getMergedRepoConfig } from '../utils/config-merger.js';
import { debug, warn, error } from '../utils/logger.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';

export type ProgressCallback = (progress: SyncProgress) => void;

export interface SyncEngineConfig {
  repoConfig: RepoConfig;
  globalMappings: AuthorMapping[];
  settings: Settings;
  stateManager: InMemoryStateManager;
  workDir: string;
  onProgress?: ProgressCallback;
}

export class SyncEngine {
  private repoConfig: MergedRepoConfig;
  private settings: Settings;
  private stateManager: InMemoryStateManager;
  private workDir: string;
  private onProgress?: ProgressCallback;

  constructor(config: SyncEngineConfig) {
    this.repoConfig = getMergedRepoConfig(config.repoConfig, config.globalMappings);
    this.settings = config.settings;
    this.stateManager = config.stateManager;
    this.workDir = config.workDir;
    this.onProgress = config.onProgress;
  }

  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const repoId = this.repoConfig.id;
    const repoWorkDir = join(this.workDir, repoId);

    try {
      this.updateProgress('init', 0, 'Starting sync');
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'init',
      });

      const rewriter = new AuthorRewriter(repoWorkDir);
      const isInstalled = await rewriter.checkFilterRepoInstalled();
      if (!isInstalled) {
        throw new Error('git-filter-repo not installed');
      }

      const githubUrl = prepareUrlForClone(this.repoConfig, true);
      const isCloned = existsSync(join(repoWorkDir, '.git'));

      if (!isCloned) {
        this.updateProgress('cloning', 10, 'Cloning from GitHub');
        this.stateManager.upsertSyncState({
          repo_id: repoId,
          sync_phase: 'cloning',
        });

        const parentDir = join(this.workDir, repoId, '..');
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        await execa('git', ['clone', githubUrl, repoId], { cwd: this.workDir });
      }

      this.updateProgress('fetching', 20, 'Fetching from GitHub');
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'fetching',
      });

      const gitOps = new GitOperations(repoWorkDir);
      await gitOps.fetchAll();

      const branches = await gitOps.getBranches('origin');
      const branchesToSync = getBranchesToSync(this.repoConfig, branches);

      this.updateProgress('checking', 40, 'Checking unmapped authors');
      
      const unmapped = await rewriter.detectUnmappedAuthors(this.repoConfig.mergedMappings);
      if (unmapped.length > 0) {
        if (this.settings.unmapped_author_policy === 'reject') {
          throw new Error(`Unmapped authors found: ${unmapped.join(', ')}`);
        } else {
          warn(`Unmapped authors (will not be rewritten): ${unmapped.join(', ')}`);
        }
      }

      this.updateProgress('rewriting', 60, 'Rewriting author information');
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'rewriting',
      });

      const repoRewriter = new AuthorRewriter(repoWorkDir);
      await repoRewriter.rewriteAuthors(this.repoConfig.mergedMappings, { force: true });

      this.updateProgress('pushing', 80, 'Pushing to internal repository');
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'pushing',
      });

      const internalUrl = prepareUrlForClone(this.repoConfig, false);
      
      const existingInternal = await gitOps.getRemotes();
      const hasInternal = existingInternal.some((r) => r.name === 'internal');
      
      if (!hasInternal) {
        await gitOps.addRemote('internal', internalUrl);
      }

      await gitOps.pushAll('internal', { force: true });

      if (this.repoConfig.tags) {
        await gitOps.pushTags('internal');
      }

      const currentHash = await gitOps.getCurrentHash();

      this.updateProgress('complete', 100, 'Sync complete');
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'complete',
        last_sync_hash: currentHash,
        last_sync_time: new Date(),
        failure_count: 0,
        last_error: null,
      });

      const endTime = Date.now();
      const result: SyncResult = {
        repo_id: repoId,
        status: 'success',
        commits_synced: 0,
        commits_rewritten: this.repoConfig.mergedMappings.length,
        branches_synced: branchesToSync,
        duration_ms: endTime - startTime,
        error: null,
      };

      this.stateManager.logSync({
        repo_id: repoId,
        sync_time: new Date(),
        status: 'success',
        commits_synced: result.commits_synced,
        commits_rewritten: result.commits_rewritten,
        branches_synced: result.branches_synced,
        duration_ms: result.duration_ms,
        error_message: null,
      });

      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error(`Sync failed for ${repoId}: ${errorMessage}`);
      
      const existingState = this.stateManager.getSyncState(repoId);
      const failureCount = (existingState?.failure_count ?? 0) + 1;
      
      this.stateManager.upsertSyncState({
        repo_id: repoId,
        sync_phase: 'failed',
        failure_count: failureCount,
        last_error: errorMessage,
      });

      const endTime = Date.now();
      const result: SyncResult = {
        repo_id: repoId,
        status: 'failed',
        commits_synced: 0,
        commits_rewritten: 0,
        branches_synced: [],
        duration_ms: endTime - startTime,
        error: errorMessage,
      };

      this.stateManager.logSync({
        repo_id: repoId,
        sync_time: new Date(),
        status: 'failed',
        commits_synced: 0,
        commits_rewritten: 0,
        branches_synced: [],
        duration_ms: result.duration_ms,
        error_message: errorMessage,
      });

      return result;
    }
  }

  private updateProgress(phase: string, progress: number, message: string): void {
    debug(`[${this.repoConfig.id}] ${phase}: ${progress}% - ${message}`);
    
    if (this.onProgress) {
      this.onProgress({
        phase,
        progress,
        message,
      });
    }
  }
}

export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  return new SyncEngine(config);
}