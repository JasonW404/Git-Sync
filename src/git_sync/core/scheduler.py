from collections.abc import Callable
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from git_sync.core.state_manager import InMemoryStateManager, StateManager
from git_sync.core.sync_engine import SyncEngine
from git_sync.models.config import AuthorMapping, RepoConfig, Settings, SyncTaskGroup
from git_sync.models.sync import SyncResult


class Scheduler:
    def __init__(
        self,
        settings: Settings,
        sync_tasks: list[SyncTaskGroup],
        global_mappings: list[AuthorMapping],
        state_manager: StateManager | InMemoryStateManager,
        get_work_dir: Callable[[str], str],
        on_sync_complete: Callable[[str, SyncResult], None] | None = None,
    ):
        self.settings = settings
        self.sync_tasks = sync_tasks
        self.global_mappings = global_mappings
        self.state_manager = state_manager
        self.get_work_dir = get_work_dir
        self.on_sync_complete = on_sync_complete
        self.scheduler = BackgroundScheduler(timezone=settings.timezone)
        self.is_running = False

    def start(self) -> None:
        if self.is_running:
            return

        self.is_running = True

        for task_group in self.sync_tasks:
            schedule = task_group.schedule or self.settings.default_schedule

            for repo in task_group.repos:
                job_id = f"{task_group.name}:{repo.id}"

                trigger = CronTrigger.from_crontab(schedule, timezone=self.settings.timezone)

                self.scheduler.add_job(
                    self._run_sync,
                    trigger=trigger,
                    id=job_id,
                    args=[repo],
                )

                print(f"[INFO] Scheduled {repo.id} with schedule: {schedule}")

        self.scheduler.start()
        print(f"[INFO] Scheduler started with {len(self.scheduler.get_jobs())} jobs")

    def stop(self) -> None:
        self.scheduler.shutdown()
        self.is_running = False
        print("[INFO] Scheduler stopped")

    def _run_sync(self, repo: RepoConfig) -> SyncResult:
        print(f"[INFO] Starting sync for {repo.id}")

        work_dir = self.get_work_dir(repo.id)

        engine = SyncEngine(
            repo_config=repo,
            global_mappings=self.global_mappings,
            settings=self.settings,
            state_manager=self.state_manager,
            work_dir=work_dir,
        )

        result = engine.sync()

        if self.on_sync_complete:
            self.on_sync_complete(repo.id, result)

        return result

    def run_sync(self, repo: RepoConfig) -> SyncResult:
        return self._run_sync(repo)

    def run_all_syncs(self) -> list[SyncResult]:
        results = []

        for task_group in self.sync_tasks:
            for repo in task_group.repos:
                result = self.run_sync(repo)
                results.append(result)

        return results

    def get_job_count(self) -> int:
        return len(self.scheduler.get_jobs())

    def is_scheduler_running(self) -> bool:
        return self.is_running

    def get_next_run_time(self, repo_id: str) -> datetime | None:
        for job in self.scheduler.get_jobs():
            if job.id.endswith(f":{repo_id}"):
                return job.next_run_time
        return None


def create_scheduler(
    settings: Settings,
    sync_tasks: list[SyncTaskGroup],
    global_mappings: list[AuthorMapping],
    state_manager: StateManager | InMemoryStateManager,
    get_work_dir: Callable[[str], str],
    on_sync_complete: Callable[[str, SyncResult], None] | None = None,
) -> Scheduler:
    return Scheduler(
        settings=settings,
        sync_tasks=sync_tasks,
        global_mappings=global_mappings,
        state_manager=state_manager,
        get_work_dir=get_work_dir,
        on_sync_complete=on_sync_complete,
    )
