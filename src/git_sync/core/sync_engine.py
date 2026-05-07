import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from git_sync.core.author_rewrite import AuthorRewriter
from git_sync.core.git_ops import GitError, GitOperations, filter_branches, prepare_url_for_clone
from git_sync.core.state_manager import InMemoryStateManager, StateManager
from git_sync.models.config import AuthorMapping, RepoConfig, Settings
from git_sync.models.state import SyncLog
from git_sync.models.sync import SyncProgress, SyncResult, SyncStatus


class SyncEngine:
    def __init__(
        self,
        repo_config: RepoConfig,
        global_mappings: list[AuthorMapping],
        settings: Settings,
        state_manager: StateManager | InMemoryStateManager,
        work_dir: str | Path,
        on_progress: Callable[[SyncProgress], None] | None = None,
    ):
        merged_mappings = global_mappings + (repo_config.author_mappings or [])
        self.repo_config = repo_config
        self.merged_mappings = merged_mappings
        self.settings = settings
        self.state_manager = state_manager
        self.work_dir = Path(work_dir)
        self.on_progress = on_progress

    def _update_progress(self, phase: str, progress: int, message: str) -> None:
        if self.on_progress:
            self.on_progress(SyncProgress(phase=phase, progress=progress, message=message))

    def sync(self) -> SyncResult:
        start_time = time.time()
        repo_id = self.repo_config.id
        repo_work_dir = self.work_dir / repo_id

        try:
            self._update_progress("init", 0, "Starting sync")
            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "init",
                }
            )

            rewriter = AuthorRewriter(repo_work_dir)
            github_url = prepare_url_for_clone(self.repo_config, is_github=True)

            if not (repo_work_dir / ".git").exists():
                self._update_progress("cloning", 10, "Cloning from GitHub")
                self.state_manager.upsert_sync_state(
                    {
                        "repo_id": repo_id,
                        "sync_phase": "cloning",
                    }
                )

                repo_work_dir.parent.mkdir(parents=True, exist_ok=True)

                clone_result = subprocess.run(
                    ["git", "clone", github_url, str(repo_work_dir)],
                    capture_output=True,
                    text=True,
                )

                if clone_result.returncode != 0:
                    error_msg = f"Clone failed from {github_url}"
                    if clone_result.stderr:
                        error_msg += f"\n{clone_result.stderr}"
                    raise RuntimeError(error_msg)

            self._update_progress("fetching", 20, "Fetching from GitHub")
            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "fetching",
                }
            )

            git_ops = GitOperations(repo_work_dir)

            try:
                git_ops.fetch_all()
            except GitError as e:
                raise RuntimeError(f"Fetch failed: {e.stderr}") from e

            branches = git_ops.get_branches("origin")
            branches_to_sync = filter_branches(branches, self.repo_config.branches)

            self._update_progress("checking", 40, "Checking unmapped authors")

            unmapped = rewriter.detect_unmapped_authors(self.merged_mappings)
            if unmapped:
                if self.settings.unmapped_author_policy == "reject":
                    raise RuntimeError(f"Unmapped authors found: {', '.join(unmapped)}")
                else:
                    print(f"[WARN] Unmapped authors (will not be rewritten): {', '.join(unmapped)}")

            self._update_progress("rewriting", 60, "Rewriting author information")
            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "rewriting",
                }
            )

            rewriter.rewrite_authors(self.merged_mappings, force=True)

            self._update_progress("pushing", 80, "Pushing to internal repository")
            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "pushing",
                }
            )

            internal_url = prepare_url_for_clone(self.repo_config, is_github=False)

            remotes = git_ops.get_remotes()
            has_internal = any(r["name"] == "internal" for r in remotes)

            if not has_internal:
                git_ops.add_remote("internal", internal_url)

            git_ops.push_all("internal", force=True)

            if self.repo_config.tags:
                git_ops.push_tags("internal")

            current_hash = git_ops.get_current_hash()

            self._update_progress("complete", 100, "Sync complete")
            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "complete",
                    "last_sync_hash": current_hash,
                    "last_sync_time": time.time(),
                    "failure_count": 0,
                    "last_error": None,
                }
            )

            end_time = time.time()
            duration_ms = int((end_time - start_time) * 1000)

            result = SyncResult(
                repo_id=repo_id,
                status=SyncStatus.SUCCESS,
                commits_synced=0,
                commits_rewritten=len(self.merged_mappings),
                branches_synced=branches_to_sync,
                duration_ms=duration_ms,
                error=None,
            )

            self.state_manager.log_sync(
                SyncLog(
                    repo_id=repo_id,
                    sync_time=time.time(),
                    status="success",
                    commits_synced=result.commits_synced,
                    commits_rewritten=result.commits_rewritten,
                    branches_synced=result.branches_synced,
                    duration_ms=result.duration_ms,
                    error_message=None,
                )
            )

            return result

        except Exception as e:
            import time

            end_time = time.time()
            error_message = str(e)

            existing_state = self.state_manager.get_sync_state(repo_id)
            failure_count = (existing_state.failure_count if existing_state else 0) + 1

            self.state_manager.upsert_sync_state(
                {
                    "repo_id": repo_id,
                    "sync_phase": "failed",
                    "failure_count": failure_count,
                    "last_error": error_message,
                }
            )

            duration_ms = int((end_time - start_time) * 1000)

            result = SyncResult(
                repo_id=repo_id,
                status=SyncStatus.FAILED,
                commits_synced=0,
                commits_rewritten=0,
                branches_synced=[],
                duration_ms=duration_ms,
                error=error_message,
            )

            self.state_manager.log_sync(
                SyncLog(
                    repo_id=repo_id,
                    sync_time=time.time(),
                    status="failed",
                    commits_synced=0,
                    commits_rewritten=0,
                    branches_synced=[],
                    duration_ms=result.duration_ms,
                    error_message=error_message,
                )
            )

            return result


def create_sync_engine(
    repo_config: RepoConfig,
    global_mappings: list[AuthorMapping],
    settings: Settings,
    state_manager: StateManager | InMemoryStateManager,
    work_dir: str | Path,
    on_progress: Callable[[SyncProgress], None] | None = None,
) -> SyncEngine:
    return SyncEngine(
        repo_config=repo_config,
        global_mappings=global_mappings,
        settings=settings,
        state_manager=state_manager,
        work_dir=work_dir,
        on_progress=on_progress,
    )
