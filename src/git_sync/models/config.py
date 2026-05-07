import os
import re
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


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
    state_dir: str = Field(default="./state")
    repo_dir: str = Field(default="./repos")
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


class RepoEndpointConfig(BaseModel):
    """Configuration for a repository endpoint (source or destination)."""

    url: str
    ssh_private_key: str | None = None  # For SSH connections
    username: str | None = None  # For HTTPS connections
    password: str | None = None  # For HTTPS connections (can be env var like ${VAR})

    @field_validator("url")
    @classmethod
    def validate_git_url(cls, v: str) -> str:
        """Validate Git URL format (SSH or HTTPS)."""
        if v.startswith("/"):
            return v  # Local path
        # SSH format: git@host:path or ssh://git@host/path
        if v.startswith("git@") or v.startswith("ssh://"):
            ssh_pattern = r"^(ssh://)?git@[a-zA-Z0-9._-]+(:[0-9]+)?[:/][a-zA-Z0-9._/-]+(\.git)?$"
            if not re.match(ssh_pattern, v):
                raise ValueError(f"Invalid SSH URL: {v}")
            return v
        # HTTPS format
        if v.startswith("https://") or v.startswith("http://"):
            try:
                from urllib.parse import urlparse

                urlparse(v)
            except Exception:
                raise ValueError(f"Invalid HTTPS URL: {v}")
            return v
        raise ValueError(
            f"Invalid Git URL: {v}. Must be SSH (git@host:path) or HTTPS (https://host/path)"
        )

    @field_validator("password")
    @classmethod
    def resolve_env_var(cls, v: str | None) -> str | None:
        """Resolve environment variable references like ${VAR}."""
        if v is None:
            return None
        env_pattern = r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}"
        match = re.match(env_pattern, v)
        if match:
            env_var = match.group(1)
            resolved = os.environ.get(env_var)
            if resolved is None:
                raise ValueError(f"Environment variable {env_var} not set")
            return resolved
        return v

    @model_validator(mode="after")
    def validate_auth_params(self) -> "RepoEndpointConfig":
        """Validate that auth params match the URL protocol."""
        url = self.url
        is_ssh = url.startswith("git@") or url.startswith("ssh://")
        is_https = url.startswith("https://") or url.startswith("http://")

        if is_ssh:
            # SSH URLs should not have username/password
            if self.username or self.password:
                raise ValueError(
                    "SSH URLs cannot use username/password auth, use ssh_private_key instead"
                )
        elif is_https:
            # HTTPS URLs can have username/password, warn if ssh_private_key is set
            if self.ssh_private_key and not (self.username or self.password):
                raise ValueError(
                    "HTTPS URLs with ssh_private_key should also specify username/password"
                )
        return self

    @property
    def is_ssh(self) -> bool:
        """Check if URL uses SSH protocol."""
        return self.url.startswith("git@") or self.url.startswith("ssh://")

    @property
    def is_https(self) -> bool:
        """Check if URL uses HTTPS protocol."""
        return self.url.startswith("https://") or self.url.startswith("http://")


class RepoConfig(BaseModel):
    id: str = Field(min_length=1)
    source: RepoEndpointConfig
    destination: RepoEndpointConfig
    branches: list[str] = Field(min_length=1)
    tags: bool = Field(default=False)
    depth: int = Field(default=0, ge=0)
    author_mappings: list[AuthorMapping] = Field(default_factory=list)

    # Legacy compatibility: keep github_url/internal_url for backward compat
    github_url: str | None = None
    internal_url: str | None = None
    auth: dict | None = None

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_config(cls, data: dict) -> dict:
        """Migrate legacy github_url/internal_url/auth to source/destination."""
        if "source" not in data and "github_url" in data:
            # Legacy format detected, migrate to new format
            github_url = data.pop("github_url", "")
            internal_url = data.pop("internal_url", "")
            auth = data.pop("auth", {})

            # Determine auth type and build endpoint configs
            auth_type = auth.get("type", "ssh")
            is_ssh = auth_type == "ssh"

            source_endpoint = {"url": github_url}
            if is_ssh:
                # Check if there's SSH key config in auth.github or auth.internal
                github_auth = auth.get("github", {})
                if github_auth.get("ssh_private_key"):
                    source_endpoint["ssh_private_key"] = github_auth["ssh_private_key"]

            dest_endpoint = {"url": internal_url}
            if is_ssh:
                internal_auth = auth.get("internal", {})
                if internal_auth.get("ssh_private_key"):
                    dest_endpoint["ssh_private_key"] = internal_auth["ssh_private_key"]
            else:
                internal_auth = auth.get("internal", {})
                dest_endpoint["username"] = internal_auth.get("username")
                dest_endpoint["password"] = internal_auth.get("password")

            data["source"] = source_endpoint
            data["destination"] = dest_endpoint

        return data


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
