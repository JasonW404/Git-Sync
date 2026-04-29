import { describe, it, expect } from 'vitest';
import {
  buildAuthUrl,
  stripAuthFromUrl,
  isSshUrl,
  isHttpsUrl,
} from './auth-url-builder.ts';

describe('buildAuthUrl', () => {
  it('should return unchanged SSH URL', () => {
    const url = 'git@github.com:org/repo.git';
    const result = buildAuthUrl(url, { method: 'ssh' });
    expect(result).toBe(url);
  });

  it('should inject token into HTTPS URL', () => {
    const url = 'https://github.com/org/repo.git';
    const result = buildAuthUrl(url, { method: 'https', token: 'ghp_xxx' });
    expect(result).toBe('https://git:ghp_xxx@github.com/org/repo.git');
  });

  it('should inject username/password into HTTPS URL', () => {
    const url = 'https://git.internal.corp/repo.git';
    const result = buildAuthUrl(url, {
      method: 'https',
      username: 'sync-user',
      password: 'SecurePass123',
    });
    expect(result).toBe('https://sync-user:SecurePass123@git.internal.corp/repo.git');
  });

  it('should return unchanged URL if no auth', () => {
    const url = 'https://github.com/org/repo.git';
    const result = buildAuthUrl(url);
    expect(result).toBe(url);
  });

  it('should use custom username with token', () => {
    const url = 'https://github.com/org/repo.git';
    const result = buildAuthUrl(url, {
      method: 'https',
      token: 'ghp_xxx',
      username: 'custom-user',
    });
    expect(result).toBe('https://custom-user:ghp_xxx@github.com/org/repo.git');
  });
});

describe('stripAuthFromUrl', () => {
  it('should strip auth from HTTPS URL', () => {
    const url = 'https://user:pass@github.com/org/repo.git';
    const result = stripAuthFromUrl(url);
    expect(result).toBe('https://github.com/org/repo.git');
  });

  it('should return unchanged SSH URL', () => {
    const url = 'git@github.com:org/repo.git';
    const result = stripAuthFromUrl(url);
    expect(result).toBe(url);
  });

  it('should return unchanged URL without auth', () => {
    const url = 'https://github.com/org/repo.git';
    const result = stripAuthFromUrl(url);
    expect(result).toBe(url);
  });
});

describe('isSshUrl', () => {
  it('should return true for SSH URL', () => {
    expect(isSshUrl('git@github.com:org/repo.git')).toBe(true);
  });

  it('should return false for HTTPS URL', () => {
    expect(isSshUrl('https://github.com/org/repo.git')).toBe(false);
  });
});

describe('isHttpsUrl', () => {
  it('should return true for HTTPS URL', () => {
    expect(isHttpsUrl('https://github.com/org/repo.git')).toBe(true);
  });

  it('should return true for HTTP URL', () => {
    expect(isHttpsUrl('http://github.com/org/repo.git')).toBe(true);
  });

  it('should return false for SSH URL', () => {
    expect(isHttpsUrl('git@github.com:org/repo.git')).toBe(false);
  });
});