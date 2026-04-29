import { describe, it, expect } from 'vitest';
import { matchBranch, filterBranches } from './repo.ts';

describe('matchBranch', () => {
  it('should match exact branch name', () => {
    const result = matchBranch('main', ['main', 'develop']);
    expect(result.matched).toBe(true);
    expect(result.pattern).toBe('main');
  });

  it('should match wildcard * for all branches', () => {
    const result = matchBranch('feature/new', ['*']);
    expect(result.matched).toBe(true);
    expect(result.pattern).toBe('*');
  });

  it('should match prefix wildcard release/*', () => {
    const result = matchBranch('release/1.0', ['release/*']);
    expect(result.matched).toBe(true);
    expect(result.pattern).toBe('release/*');
  });

  it('should match suffix wildcard *-feature', () => {
    const result = matchBranch('new-feature', ['*-feature']);
    expect(result.matched).toBe(true);
    expect(result.pattern).toBe('*-feature');
  });

  it('should not match non-pattern branch', () => {
    const result = matchBranch('main', ['develop', 'release/*']);
    expect(result.matched).toBe(false);
  });

  it('should not match branch that does not match pattern', () => {
    const result = matchBranch('hotfix/bug', ['release/*']);
    expect(result.matched).toBe(false);
  });
});

describe('filterBranches', () => {
  it('should filter branches matching patterns', () => {
    const branches = ['main', 'develop', 'release/1.0', 'release/2.0', 'hotfix/bug'];
    const patterns = ['main', 'release/*'];
    const result = filterBranches(branches, patterns);
    expect(result).toEqual(['main', 'release/1.0', 'release/2.0']);
  });

  it('should return all branches for * pattern', () => {
    const branches = ['main', 'develop', 'feature/x'];
    const result = filterBranches(branches, ['*']);
    expect(result).toEqual(branches);
  });

  it('should return empty array if no matches', () => {
    const branches = ['main', 'develop'];
    const result = filterBranches(branches, ['release/*']);
    expect(result).toEqual([]);
  });
});