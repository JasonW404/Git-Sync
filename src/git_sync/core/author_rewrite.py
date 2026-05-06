import subprocess
import tempfile
from pathlib import Path

from git_sync.models.config import AuthorMapping


class AuthorRewriter:
    def __init__(self, repo_path: str | Path):
        self.repo_path = Path(repo_path)

    def rewrite_authors(
        self, mappings: list[AuthorMapping], force: bool = False
    ) -> list[dict[str, str]]:
        if not mappings:
            return []

        mailmap_content = self._generate_mailmap(mappings)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".mailmap", delete=False) as f:
            f.write(mailmap_content)
            mailmap_path = Path(f.name)

        try:
            args = ["--mailmap", str(mailmap_path)]
            if force:
                args.append("--force")

            result = subprocess.run(
                ["git-filter-repo"] + args,
                cwd=self.repo_path,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                raise RuntimeError(f"git-filter-repo failed: {result.stderr}")

            hash_mappings = self._get_hash_mappings()
            return hash_mappings
        finally:
            mailmap_path.unlink(missing_ok=True)

    def detect_unmapped_authors(self, mappings: list[AuthorMapping]) -> list[str]:
        result = subprocess.run(
            ["git", "log", "--format=%ae", "--all"],
            cwd=self.repo_path,
            capture_output=True,
            text=True,
        )

        emails = set(email.strip() for email in result.stdout.split("\n") if email.strip())
        mapped_emails = set(m.match_email.lower() for m in mappings)

        unmapped = []
        for email in emails:
            if email.lower() not in mapped_emails:
                unmapped.append(email)

        return unmapped

    def _generate_mailmap(self, mappings: list[AuthorMapping]) -> str:
        lines = []
        for m in mappings:
            lines.append(f"{m.internal_name} <{m.internal_email}> <{m.match_email}>")
        return "\n".join(lines)

    def _get_hash_mappings(self) -> list[dict[str, str]]:
        result = subprocess.run(
            ["git", "log", "--all", "--format=%H"],
            cwd=self.repo_path,
            capture_output=True,
            text=True,
        )
        hashes = [h.strip() for h in result.stdout.split("\n") if h.strip()]
        return [{"old_hash": h, "new_hash": h} for h in hashes]


def create_author_rewriter(repo_path: str | Path) -> AuthorRewriter:
    return AuthorRewriter(repo_path)
