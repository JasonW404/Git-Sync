import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from git_sync.models.state import BackupRecord, CommitMapping, SyncLog, SyncState

SCHEMA = """
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
"""


class StateManager:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.db_path))
        self.db.executescript(SCHEMA)

    def _row_to_sync_state(self, row: tuple) -> SyncState:
        return SyncState(
            repo_id=row[1],
            last_sync_hash=row[2],
            last_sync_time=datetime.fromisoformat(row[3]) if row[3] else None,
            sync_phase=row[4],
            failure_count=row[5],
            last_error=row[6],
        )

    def _row_to_commit_mapping(self, row: tuple) -> CommitMapping:
        return CommitMapping(
            repo_id=row[1],
            github_hash=row[2],
            internal_hash=row[3],
            author_email=row[4],
            rewritten_email=row[5],
            sync_time=datetime.fromisoformat(row[6]),
        )

    def _row_to_sync_log(self, row: tuple) -> SyncLog:
        import json

        return SyncLog(
            repo_id=row[1],
            sync_time=datetime.fromisoformat(row[2]),
            status=row[3],
            commits_synced=row[4],
            commits_rewritten=row[5],
            branches_synced=json.loads(row[6]) if row[6] else [],
            duration_ms=row[7],
            error_message=row[8],
            details=json.loads(row[9]) if row[9] else None,
        )

    def _row_to_backup_record(self, row: tuple) -> BackupRecord:
        return BackupRecord(
            repo_id=row[1],
            backup_tag=row[2],
            created_at=datetime.fromisoformat(row[3]),
            expires_at=datetime.fromisoformat(row[4]),
        )

    def get_sync_state(self, repo_id: str) -> SyncState | None:
        cursor = self.db.execute("SELECT * FROM sync_state WHERE repo_id = ?", (repo_id,))
        row = cursor.fetchone()
        return self._row_to_sync_state(row) if row else None

    def upsert_sync_state(self, state: dict[str, Any]) -> None:
        repo_id = state["repo_id"]
        existing = self.get_sync_state(repo_id)

        if existing:
            update_fields = []
            update_values = []
            for key in [
                "last_sync_hash",
                "last_sync_time",
                "sync_phase",
                "failure_count",
                "last_error",
            ]:
                if key in state:
                    update_fields.append(f"{key} = ?")
                    value = state[key]
                    if key == "last_sync_time" and isinstance(value, datetime):
                        value = value.isoformat()
                    update_values.append(value)
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            update_values.append(repo_id)

            self.db.execute(
                f"UPDATE sync_state SET {', '.join(update_fields)} WHERE repo_id = ?",
                update_values,
            )
        else:
            insert_fields = ["repo_id", "sync_phase", "failure_count"]
            insert_values = [repo_id, state.get("sync_phase", "idle"), 0]

            for key in ["last_sync_hash", "last_sync_time"]:
                if key in state:
                    insert_fields.append(key)
                    value = state[key]
                    if key == "last_sync_time" and isinstance(value, datetime):
                        value = value.isoformat()
                    insert_values.append(value)

            placeholders = ", ".join(["?"] * len(insert_values))
            columns = ", ".join(insert_fields)
            self.db.execute(
                f"INSERT INTO sync_state ({columns}) VALUES ({placeholders})",
                insert_values,
            )
        self.db.commit()

    def get_commit_mapping(self, repo_id: str, github_hash: str) -> CommitMapping | None:
        cursor = self.db.execute(
            "SELECT * FROM commit_mapping WHERE repo_id = ? AND github_hash = ?",
            (repo_id, github_hash),
        )
        row = cursor.fetchone()
        return self._row_to_commit_mapping(row) if row else None

    def store_commit_mapping(self, mapping: CommitMapping) -> None:
        self.db.execute(
            """INSERT INTO commit_mapping
               (repo_id, github_hash, internal_hash, author_email, rewritten_email, sync_time)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                mapping.repo_id,
                mapping.github_hash,
                mapping.internal_hash,
                mapping.author_email,
                mapping.rewritten_email,
                mapping.sync_time.isoformat(),
            ),
        )
        self.db.commit()

    def store_commit_mapping_batch(self, mappings: list[CommitMapping]) -> None:
        self.db.executemany(
            """INSERT INTO commit_mapping
               (repo_id, github_hash, internal_hash, author_email, rewritten_email, sync_time)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [
                (
                    m.repo_id,
                    m.github_hash,
                    m.internal_hash,
                    m.author_email,
                    m.rewritten_email,
                    m.sync_time.isoformat(),
                )
                for m in mappings
            ],
        )
        self.db.commit()

    def log_sync(self, log: SyncLog) -> None:
        import json

        self.db.execute(
            """INSERT INTO sync_log
               (repo_id, sync_time, status, commits_synced, commits_rewritten,
                branches_synced, duration_ms, error_message, details_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                log.repo_id,
                log.sync_time.isoformat(),
                log.status,
                log.commits_synced,
                log.commits_rewritten,
                json.dumps(log.branches_synced),
                log.duration_ms,
                log.error_message,
                json.dumps(log.details) if log.details else None,
            ),
        )
        self.db.commit()

    def get_sync_logs(self, repo_id: str, limit: int = 100) -> list[SyncLog]:
        cursor = self.db.execute(
            "SELECT * FROM sync_log WHERE repo_id = ? ORDER BY sync_time DESC LIMIT ?",
            (repo_id, limit),
        )
        return [self._row_to_sync_log(row) for row in cursor.fetchall()]

    def create_backup_record(self, record: BackupRecord) -> None:
        self.db.execute(
            "INSERT INTO backup_record (repo_id, backup_tag, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (
                record.repo_id,
                record.backup_tag,
                record.created_at.isoformat(),
                record.expires_at.isoformat(),
            ),
        )
        self.db.commit()

    def get_expired_backups(self, repo_id: str | None = None) -> list[BackupRecord]:
        if repo_id:
            cursor = self.db.execute(
                "SELECT * FROM backup_record WHERE repo_id = ? AND expires_at < CURRENT_TIMESTAMP",
                (repo_id,),
            )
        else:
            cursor = self.db.execute(
                "SELECT * FROM backup_record WHERE expires_at < CURRENT_TIMESTAMP"
            )
        return [self._row_to_backup_record(row) for row in cursor.fetchall()]

    def delete_backup_record(self, repo_id: str, backup_tag: str) -> None:
        self.db.execute(
            "DELETE FROM backup_record WHERE repo_id = ? AND backup_tag = ?",
            (repo_id, backup_tag),
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()


class InMemoryStateManager:
    def __init__(self):
        self._states: dict[str, SyncState] = {}
        self._logs: list[SyncLog] = []

    def get_sync_state(self, repo_id: str) -> SyncState | None:
        return self._states.get(repo_id)

    def upsert_sync_state(self, state: dict[str, Any]) -> None:
        repo_id = state["repo_id"]
        existing = self._states.get(repo_id)
        if existing:
            update_data = existing.model_dump()
            for key, value in state.items():
                if key != "repo_id":
                    update_data[key] = value
            self._states[repo_id] = SyncState(**update_data)
        else:
            self._states[repo_id] = SyncState(
                repo_id=repo_id, **{k: v for k, v in state.items() if k != "repo_id"}
            )

    def log_sync(self, log: SyncLog) -> None:
        self._logs.append(log)

    def get_sync_logs(self, repo_id: str, limit: int = 100) -> list[SyncLog]:
        return [log for log in self._logs if log.repo_id == repo_id][:limit]
