import re
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


class UnmappedAuthorPolicy(str, Enum):
    WARN = "warn"
    REJECT = "reject"


class RetryConfig(BaseModel):
    max_attempts: int = Field(default=5, ge=1)
    initial_delay: str = Field(default="1s")
    max_delay: str = Field(default="30s")
    factor: float = Field(default=2.0, gt=0)


class Settings(BaseModel):
    state_dir: str = Field(default="/app/state")
    repo_dir: str = Field(default="/app/repos")
    log_level: LogLevel = Field(default=LogLevel.INFO)
    max_concurrent: int = Field(default=5, ge=1, le=10)
    default_schedule: str = Field(default="0 0 */7 * *")
    timezone: str = Field(default="Asia/Shanghai")
    retry: RetryConfig | None = None
    unmapped_author_policy: UnmappedAuthorPolicy = Field(default=UnmappedAuthorPolicy.WARN)


class AuthorMapping(BaseModel):
    match_email: str
    internal_name: str = Field(min_length=1)
    internal_email: str

    @field_validator("match_email", "internal_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        email_pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        if not re.match(email_pattern, v):
            raise ValueError(f"Invalid email: {v}")
        return v


class AuthMethod(str, Enum):
    SSH = "ssh"
    HTTPS = "https"


class AuthType(str, Enum):
    SSH = "ssh"
    HTTPS = "https"
    MIXED = "mixed"


class GitHubAuth(BaseModel):
    method: AuthMethod | None = None
    token: str | None = None
    username: str | None = None


class InternalAuth(BaseModel):
    method: AuthMethod | None = None
    token: str | None = None
    username: str | None = None
    password: str | None = None


class AuthConfig(BaseModel):
    type: AuthType
    github: GitHubAuth | None = None
    internal: InternalAuth | None = None


class RepoConfig(BaseModel):
    id: str = Field(min_length=1)
    github_url: str
    internal_url: str
    branches: list[str] = Field(min_length=1)
    tags: bool = Field(default=False)
    depth: int = Field(default=0, ge=0)
    auth: AuthConfig
    author_mappings: list[AuthorMapping] = Field(default_factory=list)

    @field_validator("github_url", "internal_url")
    @classmethod
    def validate_git_url(cls, v: str) -> str:
        if v.startswith("/"):
            return v
        if v.startswith("git@"):
            ssh_pattern = r"^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(\.git)?$"
            if not re.match(ssh_pattern, v):
                raise ValueError(f"Invalid SSH URL: {v}")
            return v
        if v.startswith("https://") or v.startswith("http://"):
            try:
                from urllib.parse import urlparse

                urlparse(v)
            except Exception:
                raise ValueError(f"Invalid HTTPS URL: {v}")
            return v
        raise ValueError(f"Invalid Git URL: {v}")


class SyncTaskGroup(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    schedule: str | None = None
    repos: list[RepoConfig] = Field(min_length=1)


class GitSyncConfig(BaseModel):
    version: Literal[1]
    settings: Settings = Field(default_factory=Settings)
    author_mappings: list[AuthorMapping] = Field(default_factory=list)
    sync_tasks: list[SyncTaskGroup] = Field(min_length=1)


def load_config(config_path: str | Path) -> GitSyncConfig:
    import yaml

    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    content = path.read_text()
    raw_config = yaml.safe_load(content)
    return GitSyncConfig.model_validate(raw_config)
