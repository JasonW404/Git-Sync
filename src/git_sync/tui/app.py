from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Container
from textual.message import Message
from textual.reactive import reactive
from textual.widgets import Footer, Header, Label, Static

from git_sync.core.state_manager import StateManager
from git_sync.models.config import load_config
from git_sync.models.state import SyncLog, SyncState


class RepoRow(Static):
    repo_id: reactive[str] = reactive("")
    group: reactive[str] = reactive("")
    status: reactive[str] = reactive("idle")
    selected: reactive[bool] = reactive(False)

    def __init__(self, repo_id: str, group: str, status: str = "idle"):
        super().__init__()
        self.repo_id = repo_id
        self.group = group
        self.status = status

    def watch_selected(self, selected: bool) -> None:
        self.refresh()

    def watch_status(self, status: str) -> None:
        self.refresh()

    def render(self) -> str:
        cursor = "❯ " if self.selected else "  "
        icon = self._get_status_icon(self.status)
        color = self._get_status_color(self.status)
        return f"{cursor}[bold]{self.repo_id}[/bold] ({self.group}) [{color}]{icon}[/{color}]"

    def _get_status_icon(self, status: str) -> str:
        icons = {"success": "✓", "failed": "✗", "syncing": "⟳", "idle": "○"}
        return icons.get(status, "○")

    def _get_status_color(self, status: str) -> str:
        colors = {"success": "green", "failed": "red", "syncing": "yellow", "idle": "gray"}
        return colors.get(status, "gray")


class SyncComplete(Message):
    def __init__(self, repo_id: str, success: bool):
        super().__init__()
        self.repo_id = repo_id
        self.success = success


class GitSyncApp(App):
    CSS = """
    Screen {
        layout: grid;
        grid-size: 2 3;
        grid-columns: 1fr 1fr;
        grid-rows: auto 1fr auto;
    }

    Header {
        column-span: 2;
    }

    Footer {
        column-span: 2;
    }

    #repo-list {
        border: solid blue;
        padding: 1;
    }

    #details {
        border: solid green;
        padding: 1;
    }

    #logs {
        column-span: 2;
        border: solid magenta;
        padding: 1;
        height: 8;
    }

    .selected {
        background: $surface-lighten-1;
    }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh", "Refresh"),
        ("j", "down", "Down"),
        ("k", "up", "Up"),
        ("s", "sync_selected", "Sync Selected"),
        ("a", "sync_all", "Sync All"),
    ]

    config_path: reactive[str] = reactive("/app/config/git-sync.yaml")
    state_path: reactive[str] = reactive("/app/state/state.db")
    selected_index: reactive[int] = reactive(0)
    syncing: reactive[str | None] = reactive(None)

    def __init__(
        self,
        config_path: str = "/app/config/git-sync.yaml",
        state_path: str = "/app/state/state.db",
    ):
        super().__init__()
        self.config_path = config_path
        self.state_path = state_path
        self.repos: list[dict] = []
        self.states: dict[str, SyncState] = {}
        self.logs: list[SyncLog] = []

    def compose(self) -> ComposeResult:
        yield Header()
        with Container(id="repo-list"):
            yield Label("Repositories", classes="title")
            yield Static(id="repos-content")
        with Container(id="details"):
            yield Label("Details", classes="title")
            yield Static(id="details-content")
        with Container(id="logs"):
            yield Label("Recent Sync Logs", classes="title")
            yield Static(id="logs-content")
        yield Footer()

    def on_mount(self) -> None:
        self.load_config()
        self.load_state()
        self.set_interval(5, self.load_state)

    def action_quit(self) -> None:
        self.exit()

    def action_refresh(self) -> None:
        self.load_config()
        self.load_state()

    def action_down(self) -> None:
        if self.selected_index < len(self.repos) - 1:
            self.selected_index += 1
            self.update_display()

    def action_up(self) -> None:
        if self.selected_index > 0:
            self.selected_index -= 1
            self.update_display()

    def action_sync_selected(self) -> None:
        if self.repos and self.syncing is None:
            repo = self.repos[self.selected_index]
            self.syncing = repo["id"]
            self.update_display()
            self.run_sync(repo["id"])

    def action_sync_all(self) -> None:
        if self.repos and self.syncing is None:
            self.syncing = "all"
            self.update_display()
            self.run_all_syncs()

    def load_config(self) -> None:
        try:
            path = Path(self.config_path)
            if not path.exists():
                self.query_one("#repos-content").update(
                    f"[red]Config not found: {self.config_path}[/red]"
                )
                return

            cfg = load_config(path)

            self.repos = [
                {
                    "id": r.id,
                    "group": g.name,
                    "branches": r.branches,
                    "schedule": g.schedule or cfg.settings.default_schedule,
                }
                for g in cfg.sync_tasks
                for r in g.repos
            ]

            self.update_display()
        except Exception as e:
            self.query_one("#repos-content").update(f"[red]Config error: {e}[/red]")

    def load_state(self) -> None:
        try:
            path = Path(self.state_path)
            if not path.exists():
                return

            state_manager = StateManager(path)

            for repo in self.repos:
                state = state_manager.get_sync_state(repo["id"])
                if state:
                    self.states[repo["id"]] = state

            self.logs = state_manager.get_sync_logs("all", limit=10) if self.repos else []

            self.update_display()
        except Exception:
            pass

    def update_display(self) -> None:
        repo_lines = []
        for idx, repo in enumerate(self.repos):
            selected = idx == self.selected_index
            state = self.states.get(repo["id"])
            status = (
                "syncing" if self.syncing == repo["id"] else (state.sync_phase if state else "idle")
            )
            icon = self._get_status_icon(status)
            color = self._get_status_color(status)

            cursor = "❯ " if selected else "  "
            repo_lines.append(
                f"{cursor}[bold cyan]{repo['id']}[/bold cyan] ({repo['group']}) [{color}]{icon}[/{color}]"
            )

        self.query_one("#repos-content").update(
            "\n".join(repo_lines) or "[dim]No repos configured[/dim]"
        )

        if self.repos:
            repo = self.repos[self.selected_index]
            state = self.states.get(repo["id"])

            details_lines = [
                f"[bold]{repo['id']}[/bold]",
                f"Group: [cyan]{repo['group']}[/cyan]",
                f"Branches: [cyan]{', '.join(repo['branches'])}[/cyan]",
                f"Schedule: [yellow]{repo['schedule']}[/yellow]",
            ]

            if state:
                details_lines.extend(
                    [
                        f"Last Sync: [dim]{state.last_sync_time or 'Never'}[/dim]",
                        f"Status: [{self._get_status_color(state.sync_phase)}]{state.sync_phase}[/{self._get_status_color(state.sync_phase)}]",
                    ]
                )
                if state.failure_count > 0:
                    details_lines.append(f"[red]Failures: {state.failure_count}[/red]")
                if state.last_error:
                    details_lines.append(f"[red]Error: {state.last_error[:50]}[/red]")

            self.query_one("#details-content").update("\n".join(details_lines))

        if self.syncing:
            self.query_one("#logs-content").update(f"[yellow]⟳ Syncing: {self.syncing}[/yellow]")
        elif self.logs:
            log_lines = []
            for log in self.logs[:5]:
                icon = "✓" if log.status == "success" else "✗"
                color = "green" if log.status == "success" else "red"
                log_lines.append(
                    f"[{color}]{icon}[/{color}] {log.repo_id} [dim]{log.sync_time}[/dim] [cyan]({log.duration_ms}ms)[/cyan]"
                )
            self.query_one("#logs-content").update("\n".join(log_lines))

    def run_sync(self, repo_id: str) -> None:
        import asyncio
        import subprocess

        async def _sync():
            try:
                result = subprocess.run(
                    ["python", "-m", "git_sync.cli", "sync", "-c", self.config_path, "-r", repo_id],
                    capture_output=True,
                    text=True,
                )
                self.syncing = None
                self.load_state()
                self.update_display()
            except Exception as e:
                self.syncing = None
                self.query_one("#logs-content").update(f"[red]Sync failed: {e}[/red]")
                self.update_display()

        asyncio.create_task(_sync())

    def run_all_syncs(self) -> None:
        import asyncio
        import subprocess

        async def _sync_all():
            try:
                result = subprocess.run(
                    ["python", "-m", "git_sync.cli", "sync", "-c", self.config_path],
                    capture_output=True,
                    text=True,
                )
                self.syncing = None
                self.load_state()
                self.update_display()
            except Exception as e:
                self.syncing = None
                self.query_one("#logs-content").update(f"[red]Sync failed: {e}[/red]")
                self.update_display()

        asyncio.create_task(_sync_all())

    def _get_status_icon(self, status: str) -> str:
        icons = {"success": "✓", "failed": "✗", "syncing": "⟳", "idle": "○", "complete": "✓"}
        return icons.get(status, "○")

    def _get_status_color(self, status: str) -> str:
        colors = {
            "success": "green",
            "failed": "red",
            "syncing": "yellow",
            "idle": "gray",
            "complete": "green",
        }
        return colors.get(status, "gray")


if __name__ == "__main__":
    app = GitSyncApp()
    app.run()
