import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateManager } from './in-memory-state-manager.ts';
import type { CommitMapping, SyncLog, BackupRecord } from '../types/state.ts';

describe('StateManager', () => {
  let stateManager: InMemoryStateManager;

  beforeEach(() => {
    stateManager = new InMemoryStateManager();
  });

  describe('sync_state', () => {
    it('should return null for non-existent repo', () => {
      const state = stateManager.getSyncState('non-existent');
      expect(state).toBeNull();
    });

    it('should create new sync state', () => {
      stateManager.upsertSyncState({ repo_id: 'test-repo', sync_phase: 'idle' });
      const state = stateManager.getSyncState('test-repo');
      
      expect(state).not.toBeNull();
      expect(state?.repo_id).toBe('test-repo');
      expect(state?.sync_phase).toBe('idle');
    });

    it('should update existing sync state', () => {
      stateManager.upsertSyncState({ repo_id: 'test-repo', sync_phase: 'idle' });
      stateManager.upsertSyncState({ 
        repo_id: 'test-repo', 
        sync_phase: 'complete',
        last_sync_hash: 'abc123',
      });
      
      const state = stateManager.getSyncState('test-repo');
      expect(state?.sync_phase).toBe('complete');
    });
  });

  describe('commit_mapping', () => {
    it('should return null for non-existent mapping', () => {
      const mapping = stateManager.getCommitMapping('test-repo', 'abc123');
      expect(mapping).toBeNull();
    });

    it('should store commit mapping', () => {
      const mapping: CommitMapping = {
        repo_id: 'test-repo',
        github_hash: 'abc123',
        internal_hash: 'def456',
        author_email: 'alice@example.com',
        rewritten_email: 'alice@internal.corp',
        sync_time: new Date(),
      };
      
      stateManager.storeCommitMapping(mapping);
      const result = stateManager.getCommitMapping('test-repo', 'abc123');
      
      expect(result).not.toBeNull();
      expect(result?.github_hash).toBe('abc123');
      expect(result?.internal_hash).toBe('def456');
    });

    it('should store batch mappings', () => {
      const mappings: CommitMapping[] = [
        {
          repo_id: 'test-repo',
          github_hash: 'abc123',
          internal_hash: 'def456',
          author_email: 'alice@example.com',
          rewritten_email: 'alice@internal.corp',
          sync_time: new Date(),
        },
        {
          repo_id: 'test-repo',
          github_hash: 'ghi789',
          internal_hash: 'jkl012',
          author_email: 'bob@example.com',
          rewritten_email: 'bob@internal.corp',
          sync_time: new Date(),
        },
      ];
      
      stateManager.storeCommitMappingBatch(mappings);
      
      expect(stateManager.getCommitMapping('test-repo', 'abc123')).not.toBeNull();
      expect(stateManager.getCommitMapping('test-repo', 'ghi789')).not.toBeNull();
    });
  });

  describe('sync_log', () => {
    it('should log sync result', () => {
      const log: SyncLog = {
        repo_id: 'test-repo',
        sync_time: new Date(),
        status: 'success',
        commits_synced: 23,
        commits_rewritten: 5,
        branches_synced: ['main', 'release/1.0'],
        duration_ms: 5000,
        error_message: null,
      };
      
      stateManager.logSync(log);
      const logs = stateManager.getSyncLogs('test-repo');
      
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('success');
      expect(logs[0].commits_synced).toBe(23);
    });

    it('should limit sync logs', () => {
      for (let i = 0; i < 5; i++) {
        stateManager.logSync({
          repo_id: 'test-repo',
          sync_time: new Date(),
          status: 'success',
          commits_synced: i,
          commits_rewritten: 0,
          branches_synced: ['main'],
          duration_ms: 100,
          error_message: null,
        });
      }
      
      const logs = stateManager.getSyncLogs('test-repo', 3);
      expect(logs.length).toBeLessThanOrEqual(3);
    });
  });

  describe('backup_record', () => {
    it('should create backup record', () => {
      const record: BackupRecord = {
        repo_id: 'test-repo',
        backup_tag: 'backup-20260428',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      
      stateManager.createBackupRecord(record);
    });

    it('should delete backup record', () => {
      stateManager.createBackupRecord({
        repo_id: 'test-repo',
        backup_tag: 'backup-20260428',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      stateManager.deleteBackupRecord('test-repo', 'backup-20260428');
    });
  });
});