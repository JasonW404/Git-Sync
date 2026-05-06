# Git-Sync Project Instructions

## Project Overview

Syncs GitHub repos to internal Git server, rewriting commit author info (name/email) via git-filter-repo. Python CLI + Textual TUI.

## Architecture

```
src/git_sync/
├── cli.py              # Entry point (Click)
├── core/
│   ├── git_ops.py      # Git operations (subprocess)
│   ├── author_rewrite.py  # git-filter-repo wrapper
│   ├── state_manager.py   # SQLite (stdlib)
│   └── scheduler.py       # APScheduler
│   └── sync_engine.py     # Sync logic
├── models/
│   ├── config.py       # Pydantic config models
│   ├── state.py        # State data models
│   └ sync.py           # Sync result models
├── tui/
│   └ app.py            # Textual TUI
└── utils/
    ├── logger.py       # Rich logging
    ├── retry.py        # Tenacity retry
    └── mailmap.py      # Mailmap generation
```

## Key Technical Details

| Aspect | Implementation |
|--------|---------------|
| Git ops | subprocess (git CLI) |
| Author rewrite | git-filter-repo |
| State | sqlite3 (stdlib) |
| TUI | Textual |
| Config | YAML via PyYAML, validated by Pydantic |
| CLI | Click |

## Sync Flow (5 Phases)

1. **Init** - Load config, verify dependencies
2. **Clone/Fetch** - Pull from GitHub via git CLI
3. **Rewrite** - git-filter-repo author rewriting
4. **Push** - Force push to internal (backup tag first)
5. **Cleanup** - Update state DB

## Author Mapping

Matched by Git commit `author.email`. Config supports:
- Global mappings (shared across repos)
- Repo-local overrides (higher priority)

## Commands

```bash
# Development
pip install -e ".[dev]"
pytest tests/
ruff check src/

# Build executable
pyinstaller build.spec

# Run
git-sync daemon          # Start scheduler
git-sync sync            # Manual sync
git-sync status          # Show status
git-sync tui             # Interactive TUI
git-sync config validate # Validate config
```

## System Requirements

- Python 3.10+
- git CLI
- git-filter-repo (pip install git-filter-repo)

## Packaging

PyInstaller single-file executable (~16MB):
```bash
pyinstaller build.spec
# Output: dist/git-sync
```

## Development Requirements

### Linting
- **Ruff** for Python
- Run `ruff check src/` before committing

### Testing
- **pytest** for all tests
- Run `pytest tests/` before starting new work

### Development Workflow
1. **Before new feature**: Run full test suite (`pytest tests/`)
2. **Implement feature**: Write code + tests
3. **After implementation**: Run tests + lint
4. **Before commit**: Run full test suite