import { describe, it, expect } from 'vitest';
import { parseDuration, calculateBackoff, shouldRetry } from './retry.ts';
import type { RetryConfig } from '../types/config.ts';

describe('parseDuration', () => {
  it('should parse seconds', () => {
    expect(parseDuration('5s')).toBe(5000);
    expect(parseDuration('1s')).toBe(1000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('1m')).toBe(60000);
    expect(parseDuration('2m')).toBe(120000);
  });

  it('should parse hours', () => {
    expect(parseDuration('1h')).toBe(3600000);
  });

  it('should parse bare number as seconds', () => {
    expect(parseDuration('30')).toBe(30000);
  });

  it('should return 0 for invalid format', () => {
    expect(parseDuration('invalid')).toBe(0);
  });
});

describe('calculateBackoff', () => {
  const config: RetryConfig = {
    max_attempts: 5,
    initial_delay: '1s',
    max_delay: '30s',
    factor: 2.0,
  };

  it('should return initial delay for first attempt', () => {
    const result = calculateBackoff(1, config);
    expect(result).toBe(1000);
  });

  it('should double delay for second attempt', () => {
    const result = calculateBackoff(2, config);
    expect(result).toBe(2000);
  });

  it('should respect max delay', () => {
    const result = calculateBackoff(10, config);
    expect(result).toBe(30000);
  });

  it('should handle different factors', () => {
    const customConfig: RetryConfig = {
      ...config,
      factor: 1.5,
    };
    const result = calculateBackoff(2, customConfig);
    expect(result).toBe(1500);
  });
});

describe('shouldRetry', () => {
  it('should return false when max attempts reached', () => {
    const result = shouldRetry(5, 5, new Error('test'));
    expect(result).toBe(false);
  });

  it('should return true when attempts not exhausted', () => {
    const result = shouldRetry(2, 5, new Error('test'));
    expect(result).toBe(true);
  });

  it('should return true if no retryable errors specified', () => {
    const result = shouldRetry(1, 5, new Error('any error'));
    expect(result).toBe(true);
  });

  it('should return true if error matches retryable pattern', () => {
    const result = shouldRetry(1, 5, new Error('network timeout'), ['network', 'timeout']);
    expect(result).toBe(true);
  });

  it('should return false if error does not match retryable pattern', () => {
    const result = shouldRetry(1, 5, new Error('authentication failed'), ['network', 'timeout']);
    expect(result).toBe(false);
  });
});