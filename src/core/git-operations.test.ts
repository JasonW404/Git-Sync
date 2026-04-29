import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitOperations, prepareUrlForClone, getBranchesToSync } from './git-operations.ts';
import { MockSimpleGit } from './mock-simple-git.ts';
import type { RepoConfig } from '../types/config.ts';

vi.mock('simple-git', () => ({
  default: vi.fn(() => new MockSimpleGit()),
  simpleGit: vi.fn(() => new MockSimpleGit()),
}));

describe('GitOperations', () => {
  let gitOps: GitOperations;
  let mockGit: MockSimpleGit;

  beforeEach(() => {
    mockGit = new MockSimpleGit();
    gitOps = new GitOperations('/test/repo');
    (gitOps as unknown as { git: MockSimpleGit }).git = mockGit;
  });

  describe('getBranches', () => {
    it('should return remote branches', async () => {
      mockGit.setResults({
        branches: { all: ['origin/main', 'origin/develop', 'origin/release/1.0'] },
      });
      
      const branches = await gitOps.getBranches('origin');
      expect(branches).toEqual(['main', 'develop', 'release/1.0']);
    });

    it('should filter by remote name', async () => {
      mockGit.setResults({
        branches: { all: ['origin/main', 'upstream/main'] },
      });
      
      const branches = await gitOps.getBranches('origin');
      expect(branches).toEqual(['main']);
    });
  });

  describe('getLocalBranches', () => {
    it('should return local branches', async () => {
      mockGit.setResults({
        branches: { all: ['main', 'develop'] },
      });
      
      const branches = await gitOps.getLocalBranches();
      expect(branches).toEqual(['main', 'develop']);
    });
  });

  describe('getTags', () => {
    it('should return tags', async () => {
      mockGit.setResults({
        tags: { all: ['v1.0.0', 'v2.0.0'] },
      });
      
      const tags = await gitOps.getTags();
      expect(tags).toEqual(['v1.0.0', 'v2.0.0']);
    });
  });

  describe('getCommits', () => {
    it('should return commit info', async () => {
      mockGit.setResults({
        log: {
          all: [
            {
              hash: 'abc123',
              author_name: 'Alice',
              author_email: 'alice@example.com',
              message: 'Initial commit',
              date: '2026-04-28',
            },
          ],
        },
      });
      
      const commits = await gitOps.getCommits('main');
      expect(commits).toHaveLength(1);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].authorEmail).toBe('alice@example.com');
    });
  });

  describe('getCurrentHash', () => {
    it('should return current HEAD hash', async () => {
      mockGit.setResults({ revparse: 'abc123def' });
      
      const hash = await gitOps.getCurrentHash();
      expect(hash).toBe('abc123def');
    });
  });

  describe('isClean', () => {
    it('should return true for clean repo', async () => {
      mockGit.setResults({ status: { isClean: true } });
      
      const clean = await gitOps.isClean();
      expect(clean).toBe(true);
    });

    it('should return false for dirty repo', async () => {
      mockGit.setResults({ status: { isClean: false } });
      
      const clean = await gitOps.isClean();
      expect(clean).toBe(false);
    });
  });

  describe('getRemotes', () => {
    it('should return remotes', async () => {
      mockGit.setResults({
        remotes: [
          { name: 'origin', refs: { fetch: 'git@github.com:org/repo.git', push: 'git@github.com:org/repo.git' } },
        ],
      });
      
      const remotes = await gitOps.getRemotes();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].name).toBe('origin');
    });
  });

  describe('getAuthorEmails', () => {
    it('should return unique author emails', async () => {
      mockGit.setResults({
        log: {
          all: [
            { hash: 'a1', author_name: 'Alice', author_email: 'alice@example.com', message: 'm1', date: 'd1' },
            { hash: 'a2', author_name: 'Bob', author_email: 'bob@example.com', message: 'm2', date: 'd2' },
            { hash: 'a3', author_name: 'Alice', author_email: 'alice@example.com', message: 'm3', date: 'd3' },
          ],
        },
      });
      
      const emails = await gitOps.getAuthorEmails('main');
      expect(emails).toEqual(['alice@example.com', 'bob@example.com']);
    });
  });

  describe('clone', () => {
    it('should call clone without errors', async () => {
      await gitOps.clone('git@github.com:org/repo.git', '/local/path');
    });
  });

  describe('fetch', () => {
    it('should call fetch without errors', async () => {
      await gitOps.fetch('origin');
      await gitOps.fetch('origin', 'main');
    });
  });

  describe('fetchAll', () => {
    it('should call fetchAll without errors', async () => {
      await gitOps.fetchAll();
    });
  });

  describe('checkout', () => {
    it('should call checkout without errors', async () => {
      await gitOps.checkout('main');
    });
  });

  describe('push', () => {
    it('should call push without errors', async () => {
      await gitOps.push('origin', 'main');
      await gitOps.push('origin', 'main', { force: true });
    });
  });

  describe('pushAll', () => {
    it('should call pushAll without errors', async () => {
      await gitOps.pushAll('origin');
      await gitOps.pushAll('origin', { force: true });
    });
  });

  describe('pushTags', () => {
    it('should call pushTags without errors', async () => {
      await gitOps.pushTags('origin');
    });
  });

  describe('createTag', () => {
    it('should call createTag without errors', async () => {
      await gitOps.createTag('v1.0.0');
      await gitOps.createTag('v1.0.0', 'Release 1.0.0');
    });
  });

  describe('addRemote', () => {
    it('should call addRemote without errors', async () => {
      await gitOps.addRemote('internal', 'git@git.internal.corp:repo.git');
    });
  });

  describe('removeRemote', () => {
    it('should call removeRemote without errors', async () => {
      await gitOps.removeRemote('internal');
    });
  });

  describe('createBranch', () => {
    it('should call createBranch without errors', async () => {
      await gitOps.createBranch('feature/new');
      await gitOps.createBranch('feature/new', 'main');
    });
  });
});

describe('prepareUrlForClone', () => {
  it('should return SSH URL unchanged', () => {
    const repoConfig: RepoConfig = {
      id: 'test',
      github_url: 'git@github.com:org/repo.git',
      internal_url: 'git@git.internal.corp:repo.git',
      branches: ['main'],
      auth: { type: 'ssh' },
    };
    
    expect(prepareUrlForClone(repoConfig, true)).toBe('git@github.com:org/repo.git');
    expect(prepareUrlForClone(repoConfig, false)).toBe('git@git.internal.corp:repo.git');
  });

  it('should inject token into HTTPS URL', () => {
    const repoConfig: RepoConfig = {
      id: 'test',
      github_url: 'https://github.com/org/repo.git',
      internal_url: 'https://git.internal.corp/repo.git',
      branches: ['main'],
      auth: {
        type: 'https',
        github: { token: 'ghp_xxx' },
        internal: { token: 'internal_xxx' },
      },
    };
    
    expect(prepareUrlForClone(repoConfig, true)).toBe('https://git:ghp_xxx@github.com/org/repo.git');
    expect(prepareUrlForClone(repoConfig, false)).toBe('https://git:internal_xxx@git.internal.corp/repo.git');
  });
});

describe('getBranchesToSync', () => {
  const repoConfig: RepoConfig = {
    id: 'test',
    github_url: 'git@github.com:org/repo.git',
    internal_url: 'git@git.internal.corp:repo.git',
    branches: ['main', 'release/*'],
    auth: { type: 'ssh' },
  };

  it('should filter branches matching patterns', () => {
    const available = ['main', 'develop', 'release/1.0', 'release/2.0', 'hotfix'];
    const result = getBranchesToSync(repoConfig, available);
    expect(result).toEqual(['main', 'release/1.0', 'release/2.0']);
  });

  it('should return all branches for wildcard', () => {
    const wildcardConfig: RepoConfig = {
      ...repoConfig,
      branches: ['*'],
    };
    const available = ['main', 'develop', 'feature/x'];
    const result = getBranchesToSync(wildcardConfig, available);
    expect(result).toEqual(available);
  });
});