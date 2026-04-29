import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorRewriter } from './author-rewrite.ts';
import type { AuthorMapping } from '../types/config.ts';
import { execa } from 'execa';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((a, b) => `${a}/${b}`),
}));

describe('AuthorRewriter', () => {
  let rewriter: AuthorRewriter;

  beforeEach(() => {
    vi.clearAllMocks();
    rewriter = new AuthorRewriter('/test/repo');
  });

  describe('checkFilterRepoInstalled', () => {
    it('should return true when git-filter-repo is installed', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ stdout: 'v1.0.0', stderr: '', failed: false, exitCode: 0 } as any);
      
      const result = await rewriter.checkFilterRepoInstalled();
      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith('git-filter-repo', ['--version']);
    });

    it('should return false when git-filter-repo is not installed', async () => {
      vi.mocked(execa).mockRejectedValueOnce(new Error('not found'));
      
      const result = await rewriter.checkFilterRepoInstalled();
      expect(result).toBe(false);
    });
  });

  describe('rewriteAuthors', () => {
    const mappings: AuthorMapping[] = [
      {
        match_email: 'alice@example.com',
        internal_name: 'Alice Wang',
        internal_email: 'alice@internal.corp',
      },
    ];

    it('should throw error when git-filter-repo not installed', async () => {
      vi.mocked(execa).mockRejectedValueOnce(new Error('not found'));
      
      await expect(rewriter.rewriteAuthors(mappings)).rejects.toThrow(
        'git-filter-repo not installed'
      );
    });

    it('should generate mailmap and call git-filter-repo', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: 'v1.0.0', stderr: '', failed: false } as any)
        .mockResolvedValueOnce({ stdout: '', stderr: '', failed: false } as any);
      
      await rewriter.rewriteAuthors(mappings);
      
      expect(execa).toHaveBeenCalledWith(
        'git-filter-repo',
        ['--mailmap', '/test/repo/.mailmap'],
        { cwd: '/test/repo', reject: false }
      );
    });

    it('should add --force flag when force option is true', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: 'v1.0.0', stderr: '', failed: false } as any)
        .mockResolvedValueOnce({ stdout: '', stderr: '', failed: false } as any);
      
      await rewriter.rewriteAuthors(mappings, { force: true });
      
      expect(execa).toHaveBeenCalledWith(
        'git-filter-repo',
        ['--mailmap', '/test/repo/.mailmap', '--force'],
        { cwd: '/test/repo', reject: false }
      );
    });

    it('should throw error on filter-repo failure', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: 'v1.0.0', stderr: '', failed: false } as any)
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', failed: true } as any);
      
      await expect(rewriter.rewriteAuthors(mappings)).rejects.toThrow(
        'Author rewrite failed'
      );
    });
  });

  describe('getCommitHashesBeforeRewrite', () => {
    it('should return list of commit hashes', async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'abc123\ndef456\nghi789',
        stderr: '',
      } as any);
      
      const hashes = await rewriter.getCommitHashesBeforeRewrite();
      expect(hashes).toEqual(['abc123', 'def456', 'ghi789']);
    });
  });

  describe('detectUnmappedAuthors', () => {
    it('should return emails not in mappings', async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'alice@example.com\nbob@example.com\nalice@example.com',
        stderr: '',
      } as any);
      
      const mappings: AuthorMapping[] = [
        { match_email: 'alice@example.com', internal_name: 'Alice', internal_email: 'alice@corp' },
      ];
      
      const unmapped = await rewriter.detectUnmappedAuthors(mappings);
      expect(unmapped).toEqual(['bob@example.com']);
    });

    it('should return empty array when all mapped', async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'alice@example.com\nalice@example.com',
        stderr: '',
      } as any);
      
      const mappings: AuthorMapping[] = [
        { match_email: 'alice@example.com', internal_name: 'Alice', internal_email: 'alice@corp' },
      ];
      
      const unmapped = await rewriter.detectUnmappedAuthors(mappings);
      expect(unmapped).toEqual([]);
    });
  });
});