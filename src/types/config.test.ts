import { describe, it, expect } from 'vitest';
import {
  GitSyncConfigSchema,
  AuthorMappingSchema,
  RepoConfigSchema,
  SettingsSchema,
  AuthConfigSchema,
} from './config.ts';

describe('SettingsSchema', () => {
  it('should parse valid settings', () => {
    const result = SettingsSchema.parse({
      state_dir: '/app/state',
      repo_dir: '/app/repos',
      log_level: 'INFO',
      max_concurrent: 5,
      default_schedule: '0 0 */7 * *',
      timezone: 'Asia/Shanghai',
    });
    expect(result.state_dir).toBe('/app/state');
    expect(result.max_concurrent).toBe(5);
  });

  it('should apply defaults for missing fields', () => {
    const result = SettingsSchema.parse({});
    expect(result.state_dir).toBe('/app/state');
    expect(result.log_level).toBe('INFO');
    expect(result.max_concurrent).toBe(5);
  });

  it('should reject invalid log_level', () => {
    expect(() => SettingsSchema.parse({ log_level: 'INVALID' })).toThrow();
  });

  it('should reject max_concurrent > 10', () => {
    expect(() => SettingsSchema.parse({ max_concurrent: 15 })).toThrow();
  });
});

describe('AuthorMappingSchema', () => {
  it('should parse valid author mapping', () => {
    const result = AuthorMappingSchema.parse({
      match_email: 'alice@example.com',
      internal_name: 'Alice Wang',
      internal_email: 'alice.wang@internal.corp',
    });
    expect(result.match_email).toBe('alice@example.com');
    expect(result.internal_name).toBe('Alice Wang');
  });

  it('should reject invalid email format', () => {
    expect(() =>
      AuthorMappingSchema.parse({
        match_email: 'invalid-email',
        internal_name: 'Alice',
        internal_email: 'alice@internal.corp',
      })
    ).toThrow();
  });

  it('should reject empty internal_name', () => {
    expect(() =>
      AuthorMappingSchema.parse({
        match_email: 'alice@example.com',
        internal_name: '',
        internal_email: 'alice@internal.corp',
      })
    ).toThrow();
  });
});

describe('AuthConfigSchema', () => {
  it('should parse SSH auth config', () => {
    const result = AuthConfigSchema.parse({ type: 'ssh' });
    expect(result.type).toBe('ssh');
  });

  it('should parse HTTPS auth config with token', () => {
    const result = AuthConfigSchema.parse({
      type: 'https',
      github: { token: 'ghp_xxx' },
    });
    expect(result.type).toBe('https');
    expect(result.github?.token).toBe('ghp_xxx');
  });

  it('should parse mixed auth config', () => {
    const result = AuthConfigSchema.parse({
      type: 'mixed',
      github: { method: 'ssh' },
      internal: { method: 'https', username: 'user', password: 'pass' },
    });
    expect(result.type).toBe('mixed');
    expect(result.github?.method).toBe('ssh');
    expect(result.internal?.username).toBe('user');
  });
});

describe('RepoConfigSchema', () => {
  it('should parse valid repo config', () => {
    const result = RepoConfigSchema.parse({
      id: 'api-service',
      github_url: 'git@github.com:org/api.git',
      internal_url: 'git@git.internal.corp:mirrors/api.git',
      branches: ['main', 'release/*'],
      auth: { type: 'ssh' },
    });
    expect(result.id).toBe('api-service');
    expect(result.branches).toEqual(['main', 'release/*']);
  });

  it('should default tags to false', () => {
    const result = RepoConfigSchema.parse({
      id: 'test',
      github_url: 'git@github.com:org/test.git',
      internal_url: 'git@git.internal.corp:test.git',
      branches: ['main'],
      auth: { type: 'ssh' },
    });
    expect(result.tags).toBe(false);
  });

  it('should reject empty id', () => {
    expect(() =>
      RepoConfigSchema.parse({
        id: '',
        github_url: 'git@github.com:org/test.git',
        internal_url: 'git@git.internal.corp:test.git',
        branches: ['main'],
        auth: { type: 'ssh' },
      })
    ).toThrow();
  });

  it('should reject empty branches array', () => {
    expect(() =>
      RepoConfigSchema.parse({
        id: 'test',
        github_url: 'git@github.com:org/test.git',
        internal_url: 'git@git.internal.corp:test.git',
        branches: [],
        auth: { type: 'ssh' },
      })
    ).toThrow();
  });
});

describe('GitSyncConfigSchema', () => {
  it('should parse complete config', () => {
    const result = GitSyncConfigSchema.parse({
      version: 1,
      settings: {
        state_dir: '/app/state',
        repo_dir: '/app/repos',
        log_level: 'INFO',
        max_concurrent: 5,
        default_schedule: '0 0 */7 * *',
        timezone: 'Asia/Shanghai',
      },
      author_mappings: [
        {
          match_email: 'alice@example.com',
          internal_name: 'Alice',
          internal_email: 'alice@internal.corp',
        },
      ],
      sync_tasks: [
        {
          name: 'production',
          repos: [
            {
              id: 'api',
              github_url: 'git@github.com:org/api.git',
              internal_url: 'git@git.internal.corp:api.git',
              branches: ['main'],
              auth: { type: 'ssh' },
            },
          ],
        },
      ],
    });
    expect(result.version).toBe(1);
    expect(result.author_mappings).toHaveLength(1);
    expect(result.sync_tasks).toHaveLength(1);
  });

  it('should default author_mappings to empty array', () => {
    const result = GitSyncConfigSchema.parse({
      version: 1,
      settings: {},
      sync_tasks: [
        {
          name: 'test',
          repos: [
            {
              id: 'test',
              github_url: 'git@github.com:org/test.git',
              internal_url: 'git@git.internal.corp:test.git',
              branches: ['main'],
              auth: { type: 'ssh' },
            },
          ],
        },
      ],
    });
    expect(result.author_mappings).toEqual([]);
  });

  it('should reject version other than 1', () => {
    expect(() =>
      GitSyncConfigSchema.parse({
        version: 2,
        settings: {},
        sync_tasks: [],
      })
    ).toThrow();
  });
});