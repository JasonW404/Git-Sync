import type { RepoConfig, AuthorMapping } from './config.js';

export interface MergedRepoConfig extends RepoConfig {
  mergedMappings: AuthorMapping[];
}

export interface SyncContext {
  repoConfig: MergedRepoConfig;
  workDir: string;
  stateDir: string;
}

export interface GitRef {
  name: string;
  hash: string;
  type: 'branch' | 'tag';
}

export interface CommitInfo {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  message: string;
  date: Date;
}

export interface BranchMatchResult {
  branch: string;
  matched: boolean;
  pattern?: string;
}

export function matchBranch(branch: string, patterns: string[]): BranchMatchResult {
  for (const pattern of patterns) {
    if (pattern === '*') {
      return { branch, matched: true, pattern };
    }
    if (pattern === branch) {
      return { branch, matched: true, pattern };
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (branch.startsWith(prefix + '/')) {
        return { branch, matched: true, pattern };
      }
    }
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (branch.endsWith(suffix)) {
        return { branch, matched: true, pattern };
      }
    }
  }
  return { branch, matched: false };
}

export function filterBranches(branches: string[], patterns: string[]): string[] {
  return branches.filter(b => matchBranch(b, patterns).matched);
}