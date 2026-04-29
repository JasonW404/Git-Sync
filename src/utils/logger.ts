import chalk from 'chalk';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

let currentLogLevel: LogLevel = 'INFO';

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

export function debug(message: string, ...args: unknown[]): void {
  if (shouldLog('DEBUG')) {
    console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (shouldLog('INFO')) {
    console.log(chalk.blue(`[INFO] ${message}`), ...args);
  }
}

export function warn(message: string, ...args: unknown[]): void {
  if (shouldLog('WARN')) {
    console.log(chalk.yellow(`[WARN] ${message}`), ...args);
  }
}

export function error(message: string, ...args: unknown[]): void {
  if (shouldLog('ERROR')) {
    console.log(chalk.red(`[ERROR] ${message}`), ...args);
  }
}

export function success(message: string, ...args: unknown[]): void {
  console.log(chalk.green(`✓ ${message}`), ...args);
}

export function progress(message: string, ...args: unknown[]): void {
  console.log(chalk.cyan(`◐ ${message}`), ...args);
}

export function logSyncResult(repoId: string, status: 'success' | 'failed' | 'partial', commits: number): void {
  const icon = status === 'success' ? '✓' : status === 'failed' ? '✗' : '⚠';
  const color = status === 'success' ? chalk.green : status === 'failed' ? chalk.red : chalk.yellow;
  console.log(color(`${icon} ${repoId}: ${status}, ${commits} commits synced`));
}