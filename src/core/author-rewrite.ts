import { execa } from 'execa';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { AuthorMapping } from '../types/config.js';
import { generateMailmap } from '../utils/mailmap-generator.js';

export class AuthorRewriter {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async checkFilterRepoInstalled(): Promise<boolean> {
    try {
      await execa('git-filter-repo', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async rewriteAuthors(
    mappings: AuthorMapping[],
    options?: { force?: boolean }
  ): Promise<{ oldHash: string; newHash: string }[]> {
    const isInstalled = await this.checkFilterRepoInstalled();
    if (!isInstalled) {
      throw new Error(
        'git-filter-repo not installed. Install with: pip install git-filter-repo'
      );
    }

    const mailmapContent = generateMailmap(mappings);
    const mailmapPath = join(this.repoPath, '.mailmap');
    
    writeFileSync(mailmapPath, mailmapContent, 'utf-8');

    const args = ['--mailmap', mailmapPath];
    
    if (options?.force) {
      args.push('--force');
    }

    const result = await execa('git-filter-repo', args, {
      cwd: this.repoPath,
      reject: false,
    });

    if (result.failed) {
      throw new Error(`Author rewrite failed: ${result.stderr}`);
    }

    return [];
  }

  async getCommitHashesBeforeRewrite(): Promise<string[]> {
    const result = await execa('git', ['rev-list', '--all'], {
      cwd: this.repoPath,
    });
    return result.stdout.split('\n').filter(Boolean);
  }

  async getCommitHashesAfterRewrite(): Promise<string[]> {
    const result = await execa('git', ['rev-list', '--all'], {
      cwd: this.repoPath,
    });
    return result.stdout.split('\n').filter(Boolean);
  }

  async analyze(): Promise<{
    commitCount: number;
    authorEmails: string[];
  }> {
    const _result = await execa('git-filter-repo', ['--analyze'], {
      cwd: this.repoPath,
      reject: false,
    });

    return {
      commitCount: 0,
      authorEmails: [],
    };
  }

  async detectUnmappedAuthors(
    mappings: AuthorMapping[]
  ): Promise<string[]> {
    const result = await execa('git', ['log', '--format=%ae', '--all'], {
      cwd: this.repoPath,
    });
    
    const emails = result.stdout
      .split('\n')
      .filter(Boolean);
    
    const mappedEmails = new Set(mappings.map((m) => m.match_email));
    
    return emails.filter((email) => !mappedEmails.has(email));
  }
}

export function createAuthorRewriter(repoPath: string): AuthorRewriter {
  return new AuthorRewriter(repoPath);
}