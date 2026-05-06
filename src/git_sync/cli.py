import json
import signal
import sys
from pathlib import Path

import click
from rich.console import Console

from git_sync.core.scheduler import create_scheduler
from git_sync.core.state_manager import InMemoryStateManager
from git_sync.models.config import RepoConfig, SyncTaskGroup, load_config

DEFAULT_CONFIG_PATH = "/app/config/git-sync.yaml"
DEFAULT_STATE_PATH = "/app/state/state.db"
console = Console()


def find_repo(sync_tasks: list[SyncTaskGroup], repo_id: str) -> RepoConfig | None:
    for group in sync_tasks:
        for repo in group.repos:
            if repo.id == repo_id:
                return repo
    return None


@click.group()
@click.version_option(version="1.0.0", prog_name="git-sync")
def cli():
    pass


@cli.command()
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.option("-s", "--state", default=DEFAULT_STATE_PATH, help="State database path")
def daemon(config: str, state: str):
    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Config validation failed: {e}[/red]")
        sys.exit(1)

    state_manager = InMemoryStateManager()

    scheduler = create_scheduler(
        settings=cfg.settings,
        sync_tasks=cfg.sync_tasks,
        global_mappings=cfg.author_mappings,
        state_manager=state_manager,
        get_work_dir=lambda repo_id: str(Path(cfg.settings.repo_dir) / repo_id),
        on_sync_complete=lambda repo_id, result: (
            console.print(f"[green]✓ {repo_id} synced successfully[/green]")
            if result.status == "success"
            else console.print(f"[red]✗ {repo_id} sync failed: {result.error}[/red]")
        ),
    )

    console.print("[blue]Starting git-sync daemon[/blue]")
    scheduler.start()

    def shutdown(signum, frame):
        console.print("[yellow]Received signal, stopping scheduler[/yellow]")
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
def sync(config: str, repo: str | None, force: bool):
    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Config validation failed: {e}[/red]")
        sys.exit(1)

    state_manager = InMemoryStateManager()

    scheduler = create_scheduler(
        settings=cfg.settings,
        sync_tasks=cfg.sync_tasks,
        global_mappings=cfg.author_mappings,
        state_manager=state_manager,
        get_work_dir=lambda repo_id: str(Path(cfg.settings.repo_dir) / repo_id),
    )

    if repo:
        repo_config = find_repo(cfg.sync_tasks, repo)
        if not repo_config:
            console.print(f"[red]Repo not found: {repo}[/red]")
            sys.exit(1)
        result = scheduler.run_sync(repo_config)
        console.print_json(json.dumps(result.model_dump(mode="json")))
    else:
        results = scheduler.run_all_syncs()
        console.print_json(json.dumps([r.model_dump(mode="json") for r in results]))


@cli.command("status")
@click.option("-c", "--config", default=DEFAULT_CONFIG_PATH, help="Config file path")
@click.option("-j", "--json", "as_json", is_flag=True, help="Output as JSON")
@click.option("-r", "--repo", help="Show specific repo status")
def status_cmd(config: str, as_json: bool, repo: str | None):
    try:
        cfg = load_config(config)
    except FileNotFoundError as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Config validation failed: {e}[/red]")
        sys.exit(1)

    status_data = {
        "repos": [
            {
                "id": r.id,
                "group": g.name,
                "branches": r.branches,
                "schedule": g.schedule or cfg.settings.default_schedule,
            }
            for g in cfg.sync_tasks
            for r in g.repos
        ]
    }

    if as_json:
        console.print_json(json.dumps(status_data))
    else:
        console.print("[bold]Configured Repositories:[/bold]")
        for repo in status_data["repos"]:
            console.print(f"  {repo['id']} ({repo['group']}): {', '.join(repo['branches'])}")


@cli.command()
@click.argument("action", type=click.Choice(["show", "validate"]))
@click.option("-c", "--config-path", default=DEFAULT_CONFIG_PATH, help="Config file path")
def config_cmd(action: str, config_path: str):
    if action == "show":
        try:
            cfg = load_config(config_path)
            console.print_json(json.dumps(cfg.model_dump(mode="json")))
        except FileNotFoundError as e:
            console.print(f"[red]Error: {e}[/red]")
            sys.exit(1)
    elif action == "validate":
        try:
            load_config(config_path)
            console.print("[green]✓ Config is valid[/green]")
        except Exception as e:
            console.print(f"[red]Config validation failed: {e}[/red]")
            sys.exit(1)


@cli.command()
def tui():
    from git_sync.tui.app import GitSyncApp

    app = GitSyncApp()
    app.run()


@cli.command("check-filter-repo")
def check_filter_repo():
    import subprocess

    try:
        result = subprocess.run(
            ["git-filter-repo", "--version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            console.print("[green]✓ git-filter-repo is installed[/green]")
        else:
            console.print("[red]✗ git-filter-repo is NOT installed[/red]")
            console.print("Install with: pip install git-filter-repo")
            sys.exit(1)
    except FileNotFoundError:
        console.print("[red]✗ git-filter-repo is NOT installed[/red]")
        console.print("Install with: pip install git-filter-repo")
        sys.exit(1)


def main():
    cli()


if __name__ == "__main__":
    main()
