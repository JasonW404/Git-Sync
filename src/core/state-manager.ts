import type { SyncState, CommitMapping, SyncLog, BackupRecord } from '../types/state.js';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT UNIQUE NOT NULL,
    last_sync_hash TEXT,
    last_sync_time DATETIME,
    sync_phase TEXT DEFAULT 'idle',
    failure_count INTEGER DEFAULT 0,
    last_error TEXT,
    config_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commit_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    github_hash TEXT NOT NULL,
    internal_hash TEXT NOT NULL,
    author_email TEXT,
    rewritten_email TEXT,
    sync_time DATETIME,
    UNIQUE(repo_id, github_hash)
);

CREATE INDEX IF NOT EXISTS idx_github_hash ON commit_mapping(github_hash);
CREATE INDEX IF NOT EXISTS idx_internal_hash ON commit_mapping(internal_hash);
CREATE INDEX IF NOT EXISTS idx_repo_mapping ON commit_mapping(repo_id);

CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    sync_time DATETIME NOT NULL,
    status TEXT NOT NULL,
    commits_synced INTEGER,
    commits_rewritten INTEGER,
    branches_synced TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_time ON sync_log(sync_time);
CREATE INDEX IF NOT EXISTS idx_repo_log ON sync_log(repo_id);

CREATE TABLE IF NOT EXISTS backup_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    backup_tag TEXT NOT NULL,
    created_at DATETIME,
    expires_at DATETIME,
    UNIQUE(repo_id, backup_tag)
);
`;

interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  transaction(fn: () => void): () => void;
  close(): void;
}

interface StatementLike {
  run(...args: unknown[]): void;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

export class StateManager {
  private db: DatabaseLike;

  constructor(db: DatabaseLike) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  getSyncState(repoId: string): SyncState | null {
    const row = this.db.prepare(
      'SELECT * FROM sync_state WHERE repo_id = ?'
    ).get(repoId) as Record<string, unknown> | undefined;
    
    if (!row) {
      return null;
    }
    
    return this.rowToSyncState(row);
  }

  upsertSyncState(state: Partial<SyncState> & { repo_id: string }): void {
    const existing = this.getSyncState(state.repo_id);
    
    if (existing) {
      this.db.prepare(
        `UPDATE sync_state SET
          last_sync_hash = ?,
          last_sync_time = ?,
          sync_phase = ?,
          failure_count = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE repo_id = ?`
      ).run(
        state.last_sync_hash ?? existing.last_sync_hash,
        state.last_sync_time ? state.last_sync_time.toISOString() : existing.last_sync_time,
        state.sync_phase ?? existing.sync_phase,
        state.failure_count ?? existing.failure_count,
        state.last_error ?? existing.last_error,
        state.repo_id
      );
    } else {
      this.db.prepare(
        `INSERT INTO sync_state (repo_id, sync_phase, failure_count)
        VALUES (?, ?, 0)`
      ).run(state.repo_id, state.sync_phase ?? 'idle');
    }
  }

  getCommitMapping(repoId: string, githubHash: string): CommitMapping | null {
    const row = this.db.prepare(
      'SELECT * FROM commit_mapping WHERE repo_id = ? AND github_hash = ?'
    ).get(repoId, githubHash) as Record<string, unknown> | undefined;
    
    if (!row) {
      return null;
    }
    
    return this.rowToCommitMapping(row);
  }

  storeCommitMapping(mapping: CommitMapping): void {
    this.db.prepare(
      `INSERT INTO commit_mapping
        (repo_id, github_hash, internal_hash, author_email, rewritten_email, sync_time)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      mapping.repo_id,
      mapping.github_hash,
      mapping.internal_hash,
      mapping.author_email,
      mapping.rewritten_email,
      mapping.sync_time.toISOString()
    );
  }

  storeCommitMappingBatch(mappings: CommitMapping[]): void {
    const insert = this.db.prepare(
      `INSERT INTO commit_mapping
        (repo_id, github_hash, internal_hash, author_email, rewritten_email, sync_time)
      VALUES (?, ?, ?, ?, ?, ?)`
    );
    
    const insertMany = this.db.transaction(() => {
      for (const m of mappings) {
        insert.run(
          m.repo_id,
          m.github_hash,
          m.internal_hash,
          m.author_email,
          m.rewritten_email,
          m.sync_time.toISOString()
        );
      }
    });
    
    insertMany();
  }

  logSync(log: SyncLog): void {
    this.db.prepare(
      `INSERT INTO sync_log
        (repo_id, sync_time, status, commits_synced, commits_rewritten,
         branches_synced, duration_ms, error_message, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      log.repo_id,
      log.sync_time.toISOString(),
      log.status,
      log.commits_synced,
      log.commits_rewritten,
      JSON.stringify(log.branches_synced),
      log.duration_ms,
      log.error_message,
      log.details ? JSON.stringify(log.details) : null
    );
  }

  getSyncLogs(repoId: string, limit: number = 100): SyncLog[] {
    const rows = this.db.prepare(
      'SELECT * FROM sync_log WHERE repo_id = ? ORDER BY sync_time DESC LIMIT ?'
    ).all(repoId, limit) as Record<string, unknown>[];
    
    return rows.map(this.rowToSyncLog);
  }

  createBackupRecord(record: BackupRecord): void {
    this.db.prepare(
      `INSERT INTO backup_record (repo_id, backup_tag, created_at, expires_at)
      VALUES (?, ?, ?, ?)`
    ).run(
      record.repo_id,
      record.backup_tag,
      record.created_at.toISOString(),
      record.expires_at.toISOString()
    );
  }

  getExpiredBackups(repoId?: string): BackupRecord[] {
    const sql = repoId
      ? 'SELECT * FROM backup_record WHERE repo_id = ? AND expires_at < CURRENT_TIMESTAMP'
      : 'SELECT * FROM backup_record WHERE expires_at < CURRENT_TIMESTAMP';
    
    const params = repoId ? [repoId] : [];
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    
    return rows.map(this.rowToBackupRecord);
  }

  deleteBackupRecord(repoId: string, backupTag: string): void {
    this.db.prepare(
      'DELETE FROM backup_record WHERE repo_id = ? AND backup_tag = ?'
    ).run(repoId, backupTag);
  }

  close(): void {
    this.db.close();
  }

  private rowToSyncState(row: Record<string, unknown>): SyncState {
    return {
      repo_id: row.repo_id as string,
      last_sync_hash: row.last_sync_hash as string | null,
      last_sync_time: row.last_sync_time ? new Date(row.last_sync_time as string) : null,
      sync_phase: row.sync_phase as SyncState['sync_phase'],
      failure_count: row.failure_count as number,
      last_error: row.last_error as string | null,
    };
  }

  private rowToCommitMapping(row: Record<string, unknown>): CommitMapping {
    return {
      repo_id: row.repo_id as string,
      github_hash: row.github_hash as string,
      internal_hash: row.internal_hash as string,
      author_email: row.author_email as string,
      rewritten_email: row.rewritten_email as string,
      sync_time: new Date(row.sync_time as string),
    };
  }

  private rowToSyncLog(row: Record<string, unknown>): SyncLog {
    return {
      repo_id: row.repo_id as string,
      sync_time: new Date(row.sync_time as string),
      status: row.status as SyncLog['status'],
      commits_synced: row.commits_synced as number,
      commits_rewritten: row.commits_rewritten as number,
      branches_synced: JSON.parse(row.branches_synced as string),
      duration_ms: row.duration_ms as number,
      error_message: row.error_message as string | null,
    };
  }

  private rowToBackupRecord(row: Record<string, unknown>): BackupRecord {
    return {
      repo_id: row.repo_id as string,
      backup_tag: row.backup_tag as string,
      created_at: new Date(row.created_at as string),
      expires_at: new Date(row.expires_at as string),
    };
  }
}

export function createStateManager(dbPath: string): StateManager {
  const db = new Database(dbPath);
  return new StateManager(db);
}