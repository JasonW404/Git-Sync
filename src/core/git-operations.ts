import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import type { RepoConfig } from '../types/config.js';
import type { CommitInfo } from '../types/repo.js';
import { buildAuthUrl } from '../utils/auth-url-builder.js';
import { filterBranches } from '../types/repo.js';

export class GitOperations {
  private git: SimpleGit;

  constructor(workDir: string) {
    this.git = simpleGit(workDir);
  }

  async clone(url: string, localPath: string, options?: { depth?: number; full?: boolean }): Promise<void> {
    const cloneOptionArray: string[] = [];
    if (options?.full) {
      // no depth flag = full clone
    } else if (options?.depth) {
      cloneOptionArray.push('--depth', String(options.depth));
    }
    
    await this.git.clone(url, localPath, cloneOptionArray);
  }

  async fetch(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.fetch(remote, branch);
    } else {
      await this.git.fetch(remote);
    }
  }

  async fetchAll(): Promise<void> {
    await this.git.fetch(['--all']);
  }

  async getBranches(remote: string = 'origin'): Promise<string[]> {
    const result = await this.git.branch(['-r']);
    return result.all
      .filter((b) => b.startsWith(`${remote}/`))
      .map((b) => b.replace(`${remote}/`, ''));
  }

  async getLocalBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  async getTags(): Promise<string[]> {
    const result = await this.git.tags();
    return result.all;
  }

  async getCommits(
    branch: string,
    sinceHash?: string,
    limit?: number
  ): Promise<CommitInfo[]> {
    const logOptions: Record<string, unknown> = {};
    
    if (sinceHash) {
      logOptions['--since-hash'] = sinceHash;
    }
    
    if (limit) {
      logOptions['-n'] = limit;
    }
    
    const log = await this.git.log([branch, ...Object.keys(logOptions).map(k => `${k}=${logOptions[k]}`)]);
    
    return log.all.map((c) => ({
      hash: c.hash,
      authorName: c.author_name ?? '',
      authorEmail: c.author_email ?? '',
      committerName: c.author_name ?? '', // simple-git doesn't provide committer fields
      committerEmail: c.author_email ?? '',
      message: c.message,
      date: new Date(c.date),
    }));
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(branch: string, fromBranch?: string): Promise<void> {
    if (fromBranch) {
      await this.git.checkoutBranch(branch, fromBranch);
    } else {
      await this.git.checkoutLocalBranch(branch);
    }
  }

  async push(
    remote: string,
    branch: string,
    options?: { force?: boolean }
  ): Promise<void> {
    const pushOptions: string[] = [];
    
    if (options?.force) {
      pushOptions.push('--force-with-lease');
    }
    
    await this.git.push(remote, branch, pushOptions);
  }

  async pushAll(remote: string, options?: { force?: boolean }): Promise<void> {
    const pushOptions: string[] = ['--all'];
    
    if (options?.force) {
      pushOptions.push('--force-with-lease');
    }
    
    await this.git.push(remote, undefined, pushOptions);
  }

  async pushTags(remote: string): Promise<void> {
    await this.git.pushTags(remote);
  }

  async createTag(tagName: string, message?: string): Promise<void> {
    if (message) {
      await this.git.tag(['-a', tagName, '-m', message]);
    } else {
      await this.git.tag([tagName]);
    }
  }

  async getCurrentHash(): Promise<string> {
    const result = await this.git.revparse(['HEAD']);
    return result.trim();
  }

  async getHashForRef(ref: string): Promise<string> {
    const result = await this.git.revparse([ref]);
    return result.trim();
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.git.addRemote(name, url);
  }

  async removeRemote(name: string): Promise<void> {
    await this.git.removeRemote(name);
  }

  async getRemotes(): Promise<{ name: string; refs: { fetch: string; push: string } }[]> {
    return await this.git.getRemotes(true);
  }

  async getAuthorEmails(branch: string): Promise<string[]> {
    const commits = await this.getCommits(branch);
    const emails = new Set(commits.map((c) => c.authorEmail));
    return Array.from(emails);
  }

  async isClean(): Promise<boolean> {
    const status = await this.git.status();
    return status.isClean();
  }

  async getWorkDir(): Promise<string> {
    return await this.git.revparse(['--show-toplevel']);
  }
}

export function createGitOperations(workDir: string): GitOperations {
  return new GitOperations(workDir);
}

export function prepareUrlForClone(
  repoConfig: RepoConfig,
  isGitHub: boolean
): string {
  const url = isGitHub ? repoConfig.github_url : repoConfig.internal_url;
  
  if (repoConfig.auth.type === 'ssh') {
    return url;
  }
  
  const auth = isGitHub ? repoConfig.auth.github : repoConfig.auth.internal;
  return buildAuthUrl(url, auth);
}

export function getBranchesToSync(
  repoConfig: RepoConfig,
  availableBranches: string[]
): string[] {
  return filterBranches(availableBranches, repoConfig.branches);
}