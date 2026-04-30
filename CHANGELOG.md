# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-04-30

### Added
- Initial release
- Core sync engine with 5-phase flow (clone/fetch/rewrite/push/update)
- Author rewriting using git-filter-repo
- Scheduler with node-cron for automated sync
- CLI with Commander (daemon, sync, status, config, tui commands)
- Interactive TUI dashboard with Ink
- SQLite state persistence (better-sqlite3)
- Git operations wrapper (simple-git)
- Config validation with Zod schemas
- Global + repo-local author mappings
- Multiple authentication modes (SSH, HTTPS with token/password)
- Docker deployment with multi-stage build
- Docker Compose configuration
- Comprehensive unit tests (175 tests, >89% coverage)
- User documentation
  - Docker deployment guide (USER_GUIDE.md)
  - Ubuntu/WSL2 installation guide (UBUNTU_INSTALL.md)
  - Technical design document (DESIGN.md)

### Features
- **Sync Engine**: Clone → Fetch → Rewrite → Push → State Update
- **Author Rewriting**: Automatic commit author replacement
- **Scheduling**: Cron-based automatic sync
- **TUI**: Interactive dashboard with keyboard navigation
- **CLI**: Full command-line interface
- **Docker**: Containerized deployment

### Security
- SSH key mounted as read-only in container
- Config file read-only in container
- No secrets in environment variables by default

### Tested
- 175 unit tests passing
- Coverage: Lines 89%, Functions 83%, Branches 88%
- Tested on Ubuntu, WSL2, Docker

[1.0.0]: https://github.com/JasonW404-HW/git-sync/releases/tag/v1.0.0