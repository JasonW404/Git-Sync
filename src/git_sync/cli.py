import json
import platform
import signal
import sys
from pathlib import Path

import click
from rich.console import Console

from git_sync.core.scheduler import create_scheduler
from git_sync.core.state_manager import InMemoryStateManager
from git_sync.models.config import LogLevel, RepoConfig, SyncTaskGroup, load_config
from git_sync.utils.logger import get_logger, set_log_level

IS_WINDOWS = platform.system() == "Windows"

if IS_WINDOWS:
    DEFAULT_CONFIG_PATH = str(Path.home() / ".git-sync" / "config.yaml")
else:
    DEFAULT_CONFIG_PATH = "/etc/git-sync/config.yaml"

console = Console()


def find_repo(sync_tasks: list[SyncTaskGroup], repo_id: str) -> RepoConfig | None:
    for group in sync_tasks:
        for repo in group.repos:
            if repo.id == repo_id:
                return repo
    return None


@click.group()
@click.version_option(version="1.0.7", prog_name="git-sync")
@click.option(
    "-c",
    "--config",
    default=DEFAULT_CONFIG_PATH,
    help="Config file path",
    show_default=True,
)
@click.option(
    "-l",
    "--log-level",
    type=click.Choice(["DEBUG", "INFO", "WARN", "ERROR"]),
    default=None,
    help="Override log level from config",
)
@click.pass_context
def cli(ctx: click.Context, config: str, log_level: str | None):
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config
    ctx.obj["log_level"] = log_level


def _load_and_init(ctx: click.Context) -> tuple:
    config_path = ctx.obj["config_path"]
    log_level_override = ctx.obj["log_level"]
    logger = get_logger()

    try:
        cfg = load_config(config_path)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Config validation failed: {e}")
        sys.exit(1)

    level = LogLevel(log_level_override) if log_level_override else cfg.settings.log_level
    set_log_level(level)
    logger = get_logger()

    return cfg, logger, Path(cfg.settings.repo_dir)


@cli.command()
@click.pass_context
def daemon(ctx: click.Context):
    cfg, logger, repo_dir = _load_and_init(ctx)

    state_manager = InMemoryStateManager()

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

    def shutdown(signum=None, frame=None):
        logger.info("Received signal, stopping scheduler")
        scheduler.stop()
        sys.exit(0)

    if IS_WINDOWS:
        try:
            import time

            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            shutdown()
    else:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

        try:
            while True:
                signal.pause()
        except KeyboardInterrupt:
            shutdown()


@cli.command()
@click.option("-r", "--repo", help="Sync specific repo only")
@click.option("-f", "--force", is_flag=True, help="Force full sync")
@click.pass_context
def sync(ctx: click.Context, repo: str | None, force: bool):
    cfg, logger, repo_dir = _load_and_init(ctx)

    state_manager = InMemoryStateManager()

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


@cli.command()
@click.option("-r", "--repo", help="Show specific repo status")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
@click.pass_context
def status(ctx: click.Context, repo: str | None, as_json: bool):
    cfg, logger, _ = _load_and_init(ctx)

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

    if repo:
        status_data["repos"] = [r for r in status_data["repos"] if r["id"] == repo]
        if not status_data["repos"]:
            logger.error(f"Repo not found: {repo}")
            sys.exit(1)

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


@cli.group(help="Config management")
def config():
    pass


@config.command()
@click.pass_context
def show(ctx: click.Context):
    cfg, logger, _ = _load_and_init(ctx)
    console.print_json(json.dumps(cfg.model_dump(mode="json")))


@config.command()
@click.pass_context
def validate(ctx: click.Context):
    _, logger, _ = _load_and_init(ctx)
    console.print("[green]✓ Config is valid[/green]")


@cli.command()
@click.pass_context
def tui(ctx: click.Context):
    _, _, _ = _load_and_init(ctx)
    from git_sync.tui.app import GitSyncApp

    app = GitSyncApp()
    app.run()


def main():
    cli()


if __name__ == "__main__":
    main()
