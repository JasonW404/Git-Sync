from git_sync.models.config import AuthorMapping


def generate_mailmap(mappings: list[AuthorMapping]) -> str:
    if not mappings:
        return ""

    lines = []
    for m in mappings:
        lines.append(f"{m.internal_name} <{m.internal_email}> <{m.match_email}>")

    return "\n".join(lines)


def parse_mailmap(content: str) -> list[AuthorMapping]:
    if not content.strip():
        return []

    mappings = []
    for line in content.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        import re

        match = re.match(r"^([^<]+)\s*<([^>]+)>\s*<([^>]+)>$", line)
        if match:
            mappings.append(
                AuthorMapping(
                    internal_name=match.group(1).strip(),
                    internal_email=match.group(2),
                    match_email=match.group(3),
                )
            )

    return mappings


def write_mailmap_to_file(mappings: list[AuthorMapping], file_path: str) -> None:
    content = generate_mailmap(mappings)
    with open(file_path, "w") as f:
        f.write(content)
