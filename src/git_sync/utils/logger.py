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
_logger: logging.Logger | None = None


def set_log_level(level: LogLevel) -> None:
    global _current_level, _logger
    _current_level = level
    if _logger:
        _logger.setLevel(level.value)
    logging.getLogger("git_sync").setLevel(level.value)


def get_logger(name: str = "git_sync") -> logging.Logger:
    global _logger
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = RichHandler(
            console=_console,
            show_time=True,
            show_path=True,
            rich_tracebacks=True,
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.setLevel(_current_level.value)
        _logger = logger
    return logger


def debug(message: str) -> None:
    get_logger().debug(message)


def info(message: str) -> None:
    get_logger().info(message)


def warn(message: str) -> None:
    get_logger().warning(message)


def error(message: str) -> None:
    get_logger().error(message)


def success(message: str) -> None:
    get_logger().info(f"✓ {message}")


def progress(message: str) -> None:
    get_logger().debug(f"◐ {message}")
