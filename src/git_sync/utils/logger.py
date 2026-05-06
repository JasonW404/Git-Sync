import logging
from enum import Enum

from rich.console import Console
from rich.logging import RichHandler


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


_console = Console()
_current_level = LogLevel.INFO


def set_log_level(level: LogLevel) -> None:
    global _current_level
    _current_level = level
    logging.getLogger().setLevel(level.value)


def get_logger(name: str = "git_sync") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = RichHandler(console=_console, show_time=False, show_path=False)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.setLevel(_current_level.value)
    return logger


def debug(message: str) -> None:
    _console.print(f"[dim][DEBUG] {message}[/dim]")


def info(message: str) -> None:
    _console.print(f"[blue][INFO] {message}[/blue]")


def warn(message: str) -> None:
    _console.print(f"[yellow][WARN] {message}[/yellow]")


def error(message: str) -> None:
    _console.print(f"[red][ERROR] {message}[/red]")


def success(message: str) -> None:
    _console.print(f"[green]✓ {message}[/green]")


def progress(message: str) -> None:
    _console.print(f"[cyan]◐ {message}[/cyan]")
