import type { Settings, RetryConfig } from '../types/config.js';

const PARSE_DURATION_REGEX = /^(\d+)(s|m|h)?$/;

export function parseDuration(duration: string): number {
  const match = duration.match(PARSE_DURATION_REGEX);
  if (!match) {
    return 0;
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';
  
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return value * 1000;
  }
}

export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const initial = parseDuration(config.initial_delay);
  const max = parseDuration(config.max_delay);
  const factor = config.factor;
  
  const delay = initial * Math.pow(factor, attempt - 1);
  return Math.min(delay, max);
}

export function shouldRetry(
  attempt: number,
  maxAttempts: number,
  error: Error,
  retryableErrors?: string[]
): boolean {
  if (attempt >= maxAttempts) {
    return false;
  }
  
  if (!retryableErrors || retryableErrors.length === 0) {
    return true;
  }
  
  const errorMessage = error.message.toLowerCase();
  return retryableErrors.some((re) => errorMessage.includes(re.toLowerCase()));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  settings: Settings
): Promise<T> {
  const config = settings.retry || {
    max_attempts: 5,
    initial_delay: '1s',
    max_delay: '30s',
    factor: 2.0,
  };
  
  const retryableErrors = ['network', 'timeout', 'connection', 'econnreset'];
  
  let attempt = 0;
  let lastError: Error | undefined;
  
  while (attempt < config.max_attempts) {
    attempt++;
    
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!shouldRetry(attempt, config.max_attempts, lastError, retryableErrors)) {
        throw lastError;
      }
      
      const delay = calculateBackoff(attempt, config);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}