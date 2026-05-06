from enum import Enum

from pydantic import BaseModel


class SyncStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


class SyncProgress(BaseModel):
    phase: str
    progress: int
    message: str


class SyncResult(BaseModel):
    repo_id: str
    status: SyncStatus
    commits_synced: int
    commits_rewritten: int
    branches_synced: list[str]
    duration_ms: int
    error: str | None = None
