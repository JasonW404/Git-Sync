import { describe, it, expect } from 'vitest';
import {
  SyncTaskSchema,
  SyncResultSchema,
  SyncProgressSchema,
} from './sync.ts';

describe('SyncTaskSchema', () => {
  it('should parse valid sync task', () => {
    const result = SyncTaskSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      repo_id: 'api-service',
      status: 'running',
      progress: 45,
      start_time: new Date(),
      end_time: null,
      error: null,
    });
    expect(result.repo_id).toBe('api-service');
    expect(result.progress).toBe(45);
  });

  it('should reject progress > 100', () => {
    expect(() =>
      SyncTaskSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        repo_id: 'test',
        status: 'running',
        progress: 150,
        start_time: null,
        end_time: null,
        error: null,
      })
    ).toThrow();
  });

  it('should reject progress < 0', () => {
    expect(() =>
      SyncTaskSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        repo_id: 'test',
        status: 'running',
        progress: -10,
        start_time: null,
        end_time: null,
        error: null,
      })
    ).toThrow();
  });
});

describe('SyncResultSchema', () => {
  it('should parse valid result', () => {
    const result = SyncResultSchema.parse({
      repo_id: 'api-service',
      status: 'success',
      commits_synced: 23,
      commits_rewritten: 5,
      branches_synced: ['main'],
      duration_ms: 5000,
      error: null,
    });
    expect(result.status).toBe('success');
    expect(result.commits_synced).toBe(23);
  });

  it('should parse partial result', () => {
    const result = SyncResultSchema.parse({
      repo_id: 'test',
      status: 'partial',
      commits_synced: 10,
      commits_rewritten: 5,
      branches_synced: ['main'],
      duration_ms: 3000,
      error: 'Some branches failed',
    });
    expect(result.status).toBe('partial');
  });
});

describe('SyncProgressSchema', () => {
  it('should parse progress with details', () => {
    const result = SyncProgressSchema.parse({
      phase: 'rewriting',
      progress: 50,
      message: 'Rewriting commits',
      details: { current_commit: 'abc123' },
    });
    expect(result.phase).toBe('rewriting');
    expect(result.details?.current_commit).toBe('abc123');
  });
});