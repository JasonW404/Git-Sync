from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SyncState(BaseModel):
    repo_id: str
    last_sync_hash: str | None = None
    last_sync_time: datetime | None = None
    sync_phase: Literal[
        "idle",
        "init",
        "cloning",
        "fetching",
        "checking",
        "rewriting",
        "pushing",
        "complete",
        "failed",
    ] = "idle"
    failure_count: int = 0
    last_error: str | None = None


class CommitMapping(BaseModel):
    repo_id: str
    github_hash: str
    internal_hash: str
    author_email: str
    rewritten_email: str
    sync_time: datetime


class SyncLog(BaseModel):
    repo_id: str
    sync_time: datetime
    status: Literal["success", "failed", "partial"]
    commits_synced: int
    commits_rewritten: int
    branches_synced: list[str]
    duration_ms: int
    error_message: str | None = None
    details: dict | None = None


class BackupRecord(BaseModel):
    repo_id: str
    backup_tag: str
    created_at: datetime
    expires_at: datetime
