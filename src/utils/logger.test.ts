import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setLogLevel,
  getLogLevel,
  debug,
  info,
  warn,
  error,
} from './logger.ts';

vi.mock('chalk', () => ({
  default: {
    gray: vi.fn((s: string) => s),
    blue: vi.fn((s: string) => s),
    yellow: vi.fn((s: string) => s),
    red: vi.fn((s: string) => s),
    green: vi.fn((s: string) => s),
    cyan: vi.fn((s: string) => s),
  },
}));

describe('setLogLevel and getLogLevel', () => {
  beforeEach(() => {
    setLogLevel('INFO');
  });

  it('should set and get log level', () => {
    setLogLevel('DEBUG');
    expect(getLogLevel()).toBe('DEBUG');
  });

  it('should affect logging behavior', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    setLogLevel('ERROR');
    debug('debug message');
    info('info message');
    warn('warn message');
    
    expect(consoleSpy).not.toHaveBeenCalled();
    
    error('error message');
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});

describe('logging functions', () => {
  beforeEach(() => {
    setLogLevel('DEBUG');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should call console.log for debug', () => {
    debug('test message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should call console.log for info', () => {
    info('test message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should call console.log for warn', () => {
    warn('test message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should call console.log for error', () => {
    error('test message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should not log debug when level is ERROR', () => {
    setLogLevel('ERROR');
    vi.clearAllMocks();
    debug('test message');
    expect(console.log).not.toHaveBeenCalled();
  });
});