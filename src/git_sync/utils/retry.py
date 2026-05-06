from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from git_sync.models.config import RetryConfig, Settings


def parse_duration(duration: str) -> float:
    match = duration.match(r"^(\d+)(s|m|h)?$")
    if not match:
        return 0

    value = int(match.group(1))
    unit = match.group(2) or "s"

    multipliers = {"s": 1, "m": 60, "h": 3600}
    return value * multipliers.get(unit, 1)


def get_retry_decorator(settings: Settings) -> retry:
    config = settings.retry or RetryConfig()

    return retry(
        stop=stop_after_attempt(config.max_attempts),
        wait=wait_exponential(
            multiplier=parse_duration(config.initial_delay),
            max=parse_duration(config.max_delay),
            exp_base=config.factor,
        ),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
    )


def with_retry(func, settings: Settings):
    decorator = get_retry_decorator(settings)
    return decorator(func)
