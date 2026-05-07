import subprocess
from pathlib import Path
from typing import NamedTuple


class GitError(Exception):
    def __init__(self, message: str, stderr: str = "", stdout: str = ""):
        super().__init__(message)
        self.stderr = stderr
        self.stdout = stdout


class CommitInfo(NamedTuple):
    hash: str
    author_name: str
    author_email: str
    committer_name: str
    committer_email: str
    message: str
    date: str


class GitOperations:
    def __init__(self, work_dir: str | Path):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)

    def _run_git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        result = subprocess.run(
            ["git"] + list(args),
            cwd=self.work_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if check and result.returncode != 0:
            cmd_str = "git " + " ".join(args)
            error_msg = f"Git command failed: {cmd_str}"
            if result.stderr:
                error_msg += f"\nStderr: {result.stderr}"
            if result.stdout:
                error_msg += f"\nStdout: {result.stdout}"
            raise GitError(error_msg, stderr=result.stderr, stdout=result.stdout)
        return result

    def clone(self, url: str, local_path: str | Path, depth: int = 0, full: bool = False) -> None:
        args = ["clone"]
        if not full and depth > 0:
            args.extend(["--depth", str(depth)])
        args.extend([url, str(local_path)])
        self._run_git(*args)

    def fetch(self, remote: str = "origin", branch: str | None = None) -> None:
        args = ["fetch", remote]
        if branch:
            args.append(branch)
        self._run_git(*args)

    def fetch_all(self) -> None:
        self._run_git("fetch", "--all")

    def get_branches(self, remote: str = "origin") -> list[str]:
        result = self._run_git("branch", "-r")
        branches = []
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if line.startswith(f"{remote}/"):
                branch_name = line.replace(f"{remote}/", "")
                if branch_name != "HEAD":
                    branches.append(branch_name)
        return branches

    def get_local_branches(self) -> list[str]:
        result = self._run_git("branch")
        return [
            line.strip().lstrip("* ") for line in result.stdout.strip().split("\n") if line.strip()
        ]

    def get_tags(self) -> list[str]:
        result = self._run_git("tag")
        return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]

    def get_commits(self, branch: str, limit: int | None = None) -> list[CommitInfo]:
        args = ["log", branch, "--format=%H|%an|%ae|%cn|%ce|%s|%ci"]
        if limit:
            args.extend(["-n", str(limit)])
        result = self._run_git(*args)

        commits = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) >= 7:
                commits.append(
                    CommitInfo(
                        hash=parts[0],
                        author_name=parts[1],
                        author_email=parts[2],
                        committer_name=parts[3],
                        committer_email=parts[4],
                        message=parts[5],
                        date=parts[6],
                    )
                )
        return commits

    def checkout(self, branch: str) -> None:
        self._run_git("checkout", branch)

    def create_branch(self, branch: str, from_branch: str | None = None) -> None:
        if from_branch:
            self._run_git("checkout", "-b", branch, from_branch)
        else:
            self._run_git("checkout", "-b", branch)

    def push(self, remote: str, branch: str, force: bool = False) -> None:
        args = ["push", remote, branch]
        if force:
            args.append("--force-with-lease")
        self._run_git(*args)

    def push_all(self, remote: str, force: bool = False) -> None:
        args = ["push", remote, "--all"]
        if force:
            args.append("--force-with-lease")
        self._run_git(*args)

    def push_tags(self, remote: str) -> None:
        self._run_git("push", remote, "--tags")

    def create_tag(self, tag_name: str, message: str | None = None) -> None:
        if message:
            self._run_git("tag", "-a", tag_name, "-m", message)
        else:
            self._run_git("tag", tag_name)

    def get_current_hash(self) -> str:
        result = self._run_git("rev-parse", "HEAD")
        return result.stdout.strip()

    def get_hash_for_ref(self, ref: str) -> str:
        result = self._run_git("rev-parse", ref)
        return result.stdout.strip()

    def add_remote(self, name: str, url: str) -> None:
        self._run_git("remote", "add", name, url)

    def remove_remote(self, name: str) -> None:
        self._run_git("remote", "remove", name)

    def get_remotes(self) -> list[dict[str, dict[str, str]]]:
        result = self._run_git("remote", "-v")
        remotes: dict[str, dict[str, str]] = {}
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 2:
                name = parts[0]
                url = parts[1]
                direction = parts[2] if len(parts) > 2 else "fetch"
                if name not in remotes:
                    remotes[name] = {}
                if direction.startswith("(fetch)"):
                    remotes[name]["fetch"] = url
                elif direction.startswith("(push)"):
                    remotes[name]["push"] = url
        return [{"name": k, "refs": v} for k, v in remotes.items()]

    def get_author_emails(self, branch: str) -> list[str]:
        result = self._run_git("log", branch, "--format=%ae")
        emails = set()
        for email in result.stdout.strip().split("\n"):
            if email:
                emails.add(email)
        return list(emails)

    def is_clean(self) -> bool:
        result = self._run_git("status", "--porcelain")
        return result.stdout.strip() == ""

    def get_work_dir(self) -> str:
        result = self._run_git("rev-parse", "--show-toplevel")
        return result.stdout.strip()


def prepare_url_for_clone(repo_config, is_github: bool) -> str:
    url = repo_config.github_url if is_github else repo_config.internal_url

    if repo_config.auth.type == "ssh":
        return url

    auth = repo_config.auth.github if is_github else repo_config.auth.internal
    if auth and auth.method == "https":
        if auth.token:
            if url.startswith("https://"):
                return url.replace("https://", f"https://{auth.token}@")
        elif auth.username and getattr(auth, "password", None):
            if url.startswith("https://"):
                return url.replace("https://", f"https://{auth.username}:{auth.password}@")

    return url


def filter_branches(available: list[str], patterns: list[str]) -> list[str]:
    import fnmatch

    matched = []
    for pattern in patterns:
        for branch in available:
            if fnmatch.fnmatch(branch, pattern):
                if branch not in matched:
                    matched.append(branch)
    return matched
