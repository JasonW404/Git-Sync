import tempfile
from pathlib import Path

import pytest

from git_sync.core.state_manager import InMemoryStateManager, StateManager
from git_sync.models.config import AuthorMapping, Settings, load_config
from git_sync.utils.mailmap import generate_mailmap, parse_mailmap


class TestConfigModels:
    def test_author_mapping_validation(self):
        mapping = AuthorMapping(
            match_email="test@example.com",
            internal_name="Test User",
            internal_email="test.internal@example.com",
        )
        assert mapping.match_email == "test@example.com"

    def test_author_mapping_invalid_email(self):
        with pytest.raises(ValueError):
            AuthorMapping(
                match_email="invalid-email",
                internal_name="Test User",
                internal_email="test.internal@example.com",
            )

    def test_settings_defaults(self):
        settings = Settings()
        assert settings.state_dir == "./data/state"
        assert settings.repo_dir == "./data/repos"
        assert settings.log_level == "INFO"
        assert settings.max_concurrent == 5


class TestStateManager:
    def test_in_memory_state_manager(self):
        manager = InMemoryStateManager()
        manager.upsert_sync_state(
            {
                "repo_id": "test-repo",
                "sync_phase": "init",
            }
        )

        state = manager.get_sync_state("test-repo")
        assert state is not None
        assert state.repo_id == "test-repo"
        assert state.sync_phase == "init"

    def test_sqlite_state_manager(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "state.db"
            manager = StateManager(db_path)

            manager.upsert_sync_state(
                {
                    "repo_id": "test-repo",
                    "sync_phase": "complete",
                    "last_sync_hash": "abc123",
                }
            )

            state = manager.get_sync_state("test-repo")
            assert state is not None
            assert state.repo_id == "test-repo"
            assert state.last_sync_hash == "abc123"

            manager.close()


class TestMailmap:
    def test_generate_mailmap(self):
        mappings = [
            AuthorMapping(
                match_email="old@example.com",
                internal_name="New User",
                internal_email="new@example.com",
            ),
        ]

        mailmap = generate_mailmap(mappings)
        assert "New User <new@example.com> <old@example.com>" in mailmap

    def test_parse_mailmap(self):
        content = "New User <new@example.com> <old@example.com>"
        mappings = parse_mailmap(content)

        assert len(mappings) == 1
        assert mappings[0].match_email == "old@example.com"
        assert mappings[0].internal_name == "New User"

    def test_empty_mailmap(self):
        assert generate_mailmap([]) == ""
        assert parse_mailmap("") == []


class TestConfigLoading:
    def test_load_config_from_file(self):
        config_content = """
version: 1
settings:
  state_dir: /tmp/state
  repo_dir: /tmp/repos
author_mappings: []
sync_tasks:
  - name: test-group
    repos:
      - id: test-repo
        source:
          url: git@github.com:test/test.git
        destination:
          url: git@internal:test/test.git
        branches: ["main"]
"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(config_content)
            f.flush()
            config_path = f.name

        try:
            config = load_config(config_path)

            assert config.version == 1
            assert config.settings.state_dir == "/tmp/state"
            assert len(config.sync_tasks) == 1
            assert config.sync_tasks[0].repos[0].id == "test-repo"
            assert config.sync_tasks[0].repos[0].source.url == "git@github.com:test/test.git"
            assert config.sync_tasks[0].repos[0].destination.url == "git@internal:test/test.git"
        finally:
            Path(config_path).unlink()
