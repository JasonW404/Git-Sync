import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from './sync-engine.ts';
import { InMemoryStateManager } from './in-memory-state-manager.ts';
import type { RepoConfig, Settings, AuthorMapping } from '../types/config.ts';

vi.mock('./git-operations.ts', () => ({
  GitOperations: vi.fn().mockImplementation(() => ({
    fetchAll: vi.fn().mockResolvedValue(undefined),
    getBranches: vi.fn().mockResolvedValue(['main', 'develop']),
    getRemotes: vi.fn().mockResolvedValue([{ name: 'origin', refs: {} }]),
    addRemote: vi.fn().mockResolvedValue(undefined),
    pushAll: vi.fn().mockResolvedValue(undefined),
    pushTags: vi.fn().mockResolvedValue(undefined),
    getCurrentHash: vi.fn().mockResolvedValue('abc123'),
  })),
  prepareUrlForClone: vi.fn((repo, isGitHub) => isGitHub ? repo.github_url : repo.internal_url),
  getBranchesToSync: vi.fn((repo, branches) => branches.filter((b: string) => repo.branches.includes(b))),
}));

vi.mock('./author-rewrite.ts', () => ({
  AuthorRewriter: vi.fn().mockImplementation(() => ({
    checkFilterRepoInstalled: vi.fn().mockResolvedValue(true),
    detectUnmappedAuthors: vi.fn().mockResolvedValue([]),
    rewriteAuthors: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../utils/logger.ts', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../utils/config-merger.ts', () => ({
  getMergedRepoConfig: vi.fn((repo, mappings) => ({
    ...repo,
    mergedMappings: mappings,
  })),
}));

describe('SyncEngine', () => {
  let stateManager: InMemoryStateManager;
  let repoConfig: RepoConfig;
  let settings: Settings;
  let globalMappings: AuthorMapping[];

  beforeEach(() => {
    stateManager = new InMemoryStateManager();
    
    repoConfig = {
      id: 'test-repo',
      github_url: 'git@github.com:org/repo.git',
      internal_url: 'git@git.internal.corp:repo.git',
      branches: ['main'],
      auth: { type: 'ssh' },
    };
    
    settings = {
      state_dir: '/app/state',
      repo_dir: '/app/repos',
      log_level: 'INFO',
      max_concurrent: 5,
      default_schedule: '0 0 */7 * *',
      timezone: 'Asia/Shanghai',
      unmapped_author_policy: 'warn',
    };
    
    globalMappings = [
      {
        match_email: 'alice@example.com',
        internal_name: 'Alice Wang',
        internal_email: 'alice@internal.corp',
      },
    ];
  });

  it('should sync successfully', async () => {
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    const result = await engine.sync();
    
    expect(result.status).toBe('success');
    expect(result.repo_id).toBe('test-repo');
    expect(result.error).toBeNull();
  });

  it('should update state on success', async () => {
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    await engine.sync();
    
    const state = stateManager.getSyncState('test-repo');
    expect(state?.sync_phase).toBe('complete');
    expect(state?.last_sync_hash).toBe('abc123');
    expect(state?.failure_count).toBe(0);
  });

  it('should log sync result', async () => {
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    await engine.sync();
    
    const logs = stateManager.getSyncLogs('test-repo');
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
  });

  it('should call progress callback', async () => {
    const progressCallback = vi.fn();
    
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
      onProgress: progressCallback,
    });
    
    await engine.sync();
    
    expect(progressCallback).toHaveBeenCalled();
  });

  it('should handle failure when git-filter-repo not installed', async () => {
    vi.mocked(await import('./author-rewrite.ts')).AuthorRewriter.mockImplementation(() => ({
      checkFilterRepoInstalled: vi.fn().mockResolvedValue(false),
      detectUnmappedAuthors: vi.fn().mockResolvedValue([]),
      rewriteAuthors: vi.fn().mockResolvedValue([]),
    }));
    
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    const result = await engine.sync();
    
    expect(result.status).toBe('failed');
    expect(result.error).toContain('git-filter-repo not installed');
  });

  it('should update failure count on error', async () => {
    vi.mocked(await import('./author-rewrite.ts')).AuthorRewriter.mockImplementation(() => ({
      checkFilterRepoInstalled: vi.fn().mockResolvedValue(false),
      detectUnmappedAuthors: vi.fn().mockResolvedValue([]),
      rewriteAuthors: vi.fn().mockResolvedValue([]),
    }));
    
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    await engine.sync();
    
    const state = stateManager.getSyncState('test-repo');
    expect(state?.sync_phase).toBe('failed');
    expect(state?.failure_count).toBe(1);
    expect(state?.last_error).toContain('git-filter-repo');
  });

  it('should warn on unmapped authors with warn policy', async () => {
    vi.mocked(await import('./author-rewrite.ts')).AuthorRewriter.mockImplementation(() => ({
      checkFilterRepoInstalled: vi.fn().mockResolvedValue(true),
      detectUnmappedAuthors: vi.fn().mockResolvedValue(['unknown@example.com']),
      rewriteAuthors: vi.fn().mockResolvedValue([]),
    }));
    
    const mockWarn = vi.fn();
    vi.mocked(await import('../utils/logger.ts')).warn = mockWarn;
    
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings,
      stateManager,
      workDir: '/test/work',
    });
    
    const result = await engine.sync();
    expect(result.status).toBe('success');
  });

  it('should reject on unmapped authors with reject policy', async () => {
    vi.mocked(await import('./author-rewrite.ts')).AuthorRewriter.mockImplementation(() => ({
      checkFilterRepoInstalled: vi.fn().mockResolvedValue(true),
      detectUnmappedAuthors: vi.fn().mockResolvedValue(['unknown@example.com']),
      rewriteAuthors: vi.fn().mockResolvedValue([]),
    }));
    
    const rejectSettings: Settings = {
      ...settings,
      unmapped_author_policy: 'reject',
    };
    
    const engine = new SyncEngine({
      repoConfig,
      globalMappings,
      settings: rejectSettings,
      stateManager,
      workDir: '/test/work',
    });
    
    const result = await engine.sync();
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Unmapped authors found');
  });
});