# Git-Sync Project Instructions

## Project Overview

Syncs GitHub repos to internal Git server, rewriting commit author info (name/email) via `git-filter-repo`. TypeScript/Node.js CLI + Ink TUI.

## Critical External Dependency

**git-filter-repo** (Python CLI tool) is required for author rewriting. Not an npm package - installed via pip:

```bash
pip install git-filter-repo
```

Docker image includes it. Local dev requires manual install. Author rewrite calls this CLI via `execa`, not a JavaScript library.

## Architecture

```
src/
├── cli.ts              # Entry point (Commander)
├── tui/                # Ink React components
├── core/               # Business logic
│   ├── git-operations.ts   # simple-git wrapper
│   ├── author-rewrite.ts   # execa → git-filter-repo
│   ├── state-manager.ts    # SQLite (better-sqlite3)
│   └── scheduler.ts        # node-cron
├── types/              # TypeScript interfaces
└ utils/                # Helpers (mailmap generation, etc.)
```

## Key Technical Details

| Aspect | Implementation |
|--------|---------------|
| Git ops | `simple-git` (wraps git CLI) |
| Author rewrite | `execa('git-filter-repo', [...])` |
| State | `better-sqlite3` (synchronous API) |
| TUI | `ink` + `@inkjs/ui` (React components) |
| Config | YAML via `js-yaml`, validated by `zod` |

## Sync Flow (5 Phases)

1. **Init** - Load config, verify git-filter-repo
2. **Fetch** - Pull from GitHub via simple-git
3. **Rewrite** - Generate `.mailmap`, run git-filter-repo
4. **Push** - Force push to internal (backup tag first)
5. **Cleanup** - Update state DB, GC old worktrees

## Author Mapping

Matched by Git commit `author.email` (not GitHub username). Config supports:
- Global mappings (shared across repos)
- Repo-local overrides (higher priority)

## Commands

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode with tsx
npm run daemon    # Start scheduled sync
npm run tui       # Interactive dashboard
npm test          # Vitest
```

## Docker

Multi-stage build: `node:20-slim` → compile → minimal runtime with git + python3 + git-filter-repo.

Volumes: `/app/config`, `/app/state`, `/app/repos`, `/app/.ssh`

## TypeScript Config

- Module: `NodeNext` (ESM-style imports with `.js` extension required)
- Path alias: `@/*` → `src/*`
- JSX: `react-jsx` for Ink components

## Development Requirements (MANDATORY)

### Linting
- **ESLint** for TypeScript (use flat config: `eslint.config.js`)
- **PyRight** for Python (if Python code exists)
- Run `npm run lint` before committing

### Dependencies
- Always use **latest stable versions** (check via Context7 before updating package.json)
- Only downgrade if incompatible with Node.js 20+ runtime

### Testing
- **Unit tests mandatory** for all new features
- **Minimum coverage: 75%**
- Run `npm test` before starting new work (verify previous features pass)
- Run tests for current feature after implementation

### Development Workflow
1. **Before new feature**: Run full test suite (`npm test`)
2. **Implement feature**: Write code + unit tests
3. **After implementation**: Run feature tests + lint
4. **Before commit**: Run full test suite + typecheck

### Test Commands
```bash
npm test                    # Run all tests
npm test src/core/          # Run specific directory tests
npm run test:coverage       # Run with coverage report
```