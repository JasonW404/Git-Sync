import json
import logging
import signal
import sys
from pathlib import Path

import click
from rich.console import Console

from git_sync.core.scheduler import create_scheduler
from git_sync.core.state_manager import InMemoryStateManager
from git_sync.models.config import LogLevel, RepoConfig, SyncTaskGroup, load_config
from git_sync.utils.logger import get_logger, set_log_level

DEFAULT_CONFIG_PATH = "/etc/git-sync/config.yaml"
console = Console()


def find_repo(sync_tasks: list[SyncTaskGroup], repo_id: str) -> RepoConfig | None:
    for group in sync_tasks:
        for repo in group.repos:
            if repo.id == repo_id:
                return repo
    return None


@click.group()
@click.version_option(version="1.0.3", prog_name="git-sync")
@click.option(
    "-l",
    "--log-level",
    type=click.Choice(["DEBUG", "INFO", "WARN", "ERROR"]),
    default=None,
    help="Override log level from config",
)
@click.pass_context
def cli(ctx: click.Context, log_level: str | None):
    ctx.ensure_object(dict)
    ctx.obj["log_level"] = log_level


def _init_logging(log_level_override: str | None, config_log_level: LogLevel) -> logging.Logger:
    level = LogLevel(log_level_override) if log_level_override else config_log_level
    set_log_level(level)
    return get_logger()


@cli.command()
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.pass_context
def daemon(ctx: click.Context, config: str):
    logger = get_logger()

    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Config validation failed: {e}")
        sys.exit(1)

    _init_logging(ctx.obj.get("log_level"), cfg.settings.log_level)
    logger = get_logger()

    state_manager = InMemoryStateManager()
    repo_dir = Path(cfg.settings.repo_dir)

    scheduler = create_scheduler(
        settings=cfg.settings,
        sync_tasks=cfg.sync_tasks,
        global_mappings=cfg.author_mappings,
        state_manager=state_manager,
        get_work_dir=lambda repo_id: str(repo_dir / repo_id),
        on_sync_complete=lambda repo_id, result: (
            logger.info(f"{repo_id} synced successfully")
            if result.status == "success"
            else logger.error(f"{repo_id} sync failed: {result.error}")
        ),
    )

    logger.info("Starting git-sync daemon")
    scheduler.start()

    def shutdown(signum, frame):
        logger.info("Received signal, stopping scheduler")
        scheduler.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            signal.pause()
    except KeyboardInterrupt:
        shutdown(None, None)


@cli.command()
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.option("-r", "--repo", help="Sync specific repo only")
@click.option("-f", "--force", is_flag=True, help="Force full sync")
@click.pass_context
def sync(ctx: click.Context, config: str, repo: str | None, force: bool):
    logger = get_logger()

    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Config validation failed: {e}")
        sys.exit(1)

    _init_logging(ctx.obj.get("log_level"), cfg.settings.log_level)
    logger = get_logger()

    state_manager = InMemoryStateManager()
    repo_dir = Path(cfg.settings.repo_dir)

    scheduler = create_scheduler(
        settings=cfg.settings,
        sync_tasks=cfg.sync_tasks,
        global_mappings=cfg.author_mappings,
        state_manager=state_manager,
        get_work_dir=lambda repo_id: str(repo_dir / repo_id),
    )

    if repo:
        repo_config = find_repo(cfg.sync_tasks, repo)
        if not repo_config:
            logger.error(f"Repo not found: {repo}")
            sys.exit(1)
        logger.debug(f"Syncing repo: {repo}")
        result = scheduler.run_sync(repo_config)
        console.print_json(json.dumps(result.model_dump(mode="json")))
    else:
        logger.debug("Syncing all repos")
        results = scheduler.run_all_syncs()
        console.print_json(json.dumps([r.model_dump(mode="json") for r in results]))


@cli.command("status")
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.option("-j", "--json", "as_json", is_flag=True, help="Output as JSON")
@click.option("-r", "--repo", help="Show specific repo status")
@click.pass_context
def status_cmd(ctx: click.Context, config: str, as_json: bool, repo: str | None):
    logger = get_logger()

    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Config validation failed: {e}")
        sys.exit(1)

    _init_logging(ctx.obj.get("log_level"), cfg.settings.log_level)

    status_data = {
        "repos": [
            {
                "id": r.id,
                "group": g.name,
                "branches": r.branches,
                "schedule": g.schedule or cfg.settings.default_schedule,
                "source": r.source.url,
                "destination": r.destination.url,
            }
            for g in cfg.sync_tasks
            for r in g.repos
        ]
    }

    if as_json:
        console.print_json(json.dumps(status_data))
    else:
        console.print("[bold]Configured Repositories:[/bold]")
        for repo_data in status_data["repos"]:
            console.print(
                f"  {repo_data['id']} ({repo_data['group']}): "
                f"{', '.join(repo_data['branches'])} - "
                f"{repo_data['source']} -> {repo_data['destination']}"
            )


@cli.command()
@click.argument("action", type=click.Choice(["show", "validate"]))
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.pass_context
def config_cmd(ctx: click.Context, action: str, config: str):
    logger = get_logger()

    if action == "show":
        try:
            cfg = load_config(config)
            console.print_json(json.dumps(cfg.model_dump(mode="json")))
        except FileNotFoundError as e:
            logger.error(str(e))
            sys.exit(1)
    elif action == "validate":
        try:
            load_config(config)
            console.print("[green]✓ Config is valid[/green]")
        except Exception as e:
            logger.error(f"Config validation failed: {e}")
            sys.exit(1)


@cli.command()
@click.pass_context
def tui(ctx: click.Context):
    from git_sync.tui.app import GitSyncApp

    app = GitSyncApp()
    app.run()


@cli.command("check-filter-repo")
def check_filter_repo():
    import subprocess

    logger = get_logger()

    try:
        result = subprocess.run(
            ["git-filter-repo", "--version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            console.print("[green]✓ git-filter-repo is installed[/green]")
        else:
            logger.error("git-filter-repo is NOT installed")
            console.print("Install with: pip install git-filter-repo")
            sys.exit(1)
    except FileNotFoundError:
        logger.error("git-filter-repo is NOT installed")
        console.print("Install with: pip install git-filter-repo")
        sys.exit(1)


def main():
    cli()


if __name__ == "__main__":
    main()
