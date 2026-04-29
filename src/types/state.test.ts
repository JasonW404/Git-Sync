import { describe, it, expect } from 'vitest';
import {
  SyncStateSchema,
  SyncPhaseSchema,
  CommitMappingSchema,
  SyncLogSchema,
} from './state.ts';

describe('SyncPhaseSchema', () => {
  it('should accept valid phases', () => {
    const phases = ['idle', 'init', 'fetching', 'rewriting', 'pushing', 'complete', 'failed'];
    for (const phase of phases) {
      expect(SyncPhaseSchema.parse(phase)).toBe(phase);
    }
  });

  it('should reject invalid phase', () => {
    expect(() => SyncPhaseSchema.parse('invalid')).toThrow();
  });
});

describe('SyncStateSchema', () => {
  it('should parse valid sync state', () => {
    const result = SyncStateSchema.parse({
      repo_id: 'api-service',
      last_sync_hash: 'abc123',
      last_sync_time: new Date(),
      sync_phase: 'complete',
      failure_count: 0,
      last_error: null,
    });
    expect(result.repo_id).toBe('api-service');
    expect(result.sync_phase).toBe('complete');
  });

  it('should accept null values for optional fields', () => {
    const result = SyncStateSchema.parse({
      repo_id: 'new-repo',
      last_sync_hash: null,
      last_sync_time: null,
      sync_phase: 'idle',
      failure_count: 0,
      last_error: null,
    });
    expect(result.last_sync_hash).toBeNull();
    expect(result.last_sync_time).toBeNull();
  });
});

describe('CommitMappingSchema', () => {
  it('should parse valid commit mapping', () => {
    const result = CommitMappingSchema.parse({
      repo_id: 'api-service',
      github_hash: 'abc123',
      internal_hash: 'def456',
      author_email: 'alice@example.com',
      rewritten_email: 'alice@internal.corp',
      sync_time: new Date(),
    });
    expect(result.github_hash).toBe('abc123');
    expect(result.internal_hash).toBe('def456');
  });

  it('should reject invalid email', () => {
    expect(() =>
      CommitMappingSchema.parse({
        repo_id: 'test',
        github_hash: 'abc',
        internal_hash: 'def',
        author_email: 'invalid',
        rewritten_email: 'alice@internal.corp',
        sync_time: new Date(),
      })
    ).toThrow();
  });
});

describe('SyncLogSchema', () => {
  it('should parse success log', () => {
    const result = SyncLogSchema.parse({
      repo_id: 'api-service',
      sync_time: new Date(),
      status: 'success',
      commits_synced: 23,
      commits_rewritten: 5,
      branches_synced: ['main', 'release/1.0'],
      duration_ms: 5000,
      error_message: null,
    });
    expect(result.status).toBe('success');
    expect(result.commits_synced).toBe(23);
  });

  it('should parse failed log with error', () => {
    const result = SyncLogSchema.parse({
      repo_id: 'test',
      sync_time: new Date(),
      status: 'failed',
      commits_synced: 0,
      commits_rewritten: 0,
      branches_synced: [],
      duration_ms: 100,
      error_message: 'Connection failed',
    });
    expect(result.status).toBe('failed');
    expect(result.error_message).toBe('Connection failed');
  });
});