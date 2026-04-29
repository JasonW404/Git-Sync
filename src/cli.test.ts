import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCLI } from './cli.ts';
import { Command } from 'commander';

vi.mock('./scheduler.ts', () => ({
  createScheduler: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    runSync: vi.fn(async () => ({ status: 'success' })),
    runAllSyncs: vi.fn(async () => [{ status: 'success' }]),
  })),
  Scheduler: vi.fn(),
}));

vi.mock('./in-memory-state-manager.ts', () => ({
  InMemoryStateManager: vi.fn(() => ({
    getRepoState: vi.fn(),
    setRepoState: vi.fn(),
    getAllRepoStates: vi.fn(() => []),
  })),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => `
version: 1
settings:
  repo_dir: /app/repos
  default_schedule: "0 0 * * *"
sync_tasks:
  - name: group1
    repos:
      - id: repo1
        github_url: https://github.com/org/repo1
        internal_url: https://internal.git/org/repo1
        branches: ["main"]
        auth:
          type: ssh
author_mappings:
  - match_email: external@example.com
    internal_name: Internal User
    internal_email: internal@example.com
`),
  existsSync: vi.fn(() => true),
}));

vi.mock('./utils/logger.ts', () => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

describe('CLI', () => {
  let originalArgv: string[];
  
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    process.argv = originalArgv;
  });
  
  describe('createCLI', () => {
    it('should create a command program', () => {
      const program = createCLI();
      expect(program).toBeInstanceOf(Command);
      expect(program.name()).toBe('git-sync');
    });
    
    it('should have daemon command', () => {
      const program = createCLI();
      const daemonCmd = program.commands.find(c => c.name() === 'daemon');
      expect(daemonCmd).toBeDefined();
      expect(daemonCmd?.description()).toContain('daemon');
    });
    
    it('should have sync command', () => {
      const program = createCLI();
      const syncCmd = program.commands.find(c => c.name() === 'sync');
      expect(syncCmd).toBeDefined();
      expect(syncCmd?.description()).toContain('manual sync');
    });
    
    it('should have status command', () => {
      const program = createCLI();
      const statusCmd = program.commands.find(c => c.name() === 'status');
      expect(statusCmd).toBeDefined();
      expect(statusCmd?.description()).toContain('status');
    });
    
    it('should have config command', () => {
      const program = createCLI();
      const configCmd = program.commands.find(c => c.name() === 'config');
      expect(configCmd).toBeDefined();
      expect(configCmd?.description()).toContain('Config management');
    });
    
    it('should have tui command', () => {
      const program = createCLI();
      const tuiCmd = program.commands.find(c => c.name() === 'tui');
      expect(tuiCmd).toBeDefined();
      expect(tuiCmd?.description()).toContain('interactive TUI');
    });
    
    it('should have check-filter-repo command', () => {
      const program = createCLI();
      const checkCmd = program.commands.find(c => c.name() === 'check-filter-repo');
      expect(checkCmd).toBeDefined();
    });
  });
  
  describe('status command', () => {
    it('should output status as JSON when --json flag is set', async () => {
      const program = createCLI();
      const consoleSpy = vi.spyOn(console, 'log');
      
      await program.parseAsync(['node', 'git-sync', 'status', '--json']);
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('repo1');
    });
  });
  
  describe('config validate command', () => {
    it('should validate config and show success', async () => {
      const program = createCLI();
      const { success } = await import('./utils/logger.ts');
      
      await program.parseAsync(['node', 'git-sync', 'config', 'validate']);
      
      expect(success).toHaveBeenCalledWith('Config is valid');
    });
  });
  
  describe('config show command', () => {
    it('should show config as JSON', async () => {
      const program = createCLI();
      const consoleSpy = vi.spyOn(console, 'log');
      
      await program.parseAsync(['node', 'git-sync', 'config', 'show']);
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('settings');
    });
  });
});