import type { SyncState, CommitMapping, SyncLog, BackupRecord } from '../types/state.js';

interface InMemoryData {
  syncStates: Map<string, SyncState>;
  commitMappings: Map<string, CommitMapping>;
  syncLogs: SyncLog[];
  backupRecords: BackupRecord[];
}

export class InMemoryStateManager {
  private data: InMemoryData = {
    syncStates: new Map(),
    commitMappings: new Map(),
    syncLogs: [],
    backupRecords: [],
  };

  getSyncState(repoId: string): SyncState | null {
    return this.data.syncStates.get(repoId) ?? null;
  }

  upsertSyncState(state: Partial<SyncState> & { repo_id: string }): void {
    const existing = this.getSyncState(state.repo_id);
    
    if (existing) {
      this.data.syncStates.set(state.repo_id, {
        ...existing,
        ...state,
      });
    } else {
      this.data.syncStates.set(state.repo_id, {
        repo_id: state.repo_id,
        last_sync_hash: null,
        last_sync_time: null,
        sync_phase: state.sync_phase ?? 'idle',
        failure_count: 0,
        last_error: null,
      });
    }
  }

  getCommitMapping(repoId: string, githubHash: string): CommitMapping | null {
    const key = `${repoId}:${githubHash}`;
    return this.data.commitMappings.get(key) ?? null;
  }

  storeCommitMapping(mapping: CommitMapping): void {
    const key = `${mapping.repo_id}:${mapping.github_hash}`;
    this.data.commitMappings.set(key, mapping);
  }

  storeCommitMappingBatch(mappings: CommitMapping[]): void {
    for (const m of mappings) {
      this.storeCommitMapping(m);
    }
  }

  logSync(log: SyncLog): void {
    this.data.syncLogs.push(log);
  }

  getSyncLogs(repoId: string, limit: number = 100): SyncLog[] {
    return this.data.syncLogs
      .filter((l) => l.repo_id === repoId)
      .slice(0, limit);
  }

  createBackupRecord(record: BackupRecord): void {
    this.data.backupRecords.push(record);
  }

  getExpiredBackups(repoId?: string): BackupRecord[] {
    const now = new Date();
    return this.data.backupRecords.filter((r) => {
      if (repoId && r.repo_id !== repoId) return false;
      return r.expires_at < now;
    });
  }

  deleteBackupRecord(repoId: string, backupTag: string): void {
    this.data.backupRecords = this.data.backupRecords.filter(
      (r) => !(r.repo_id === repoId && r.backup_tag === backupTag)
    );
  }

  close(): void {}
}