import { describe, it, expect } from 'vitest';
import { getStatusColor, getStatusIcon, RepoItem } from './index.tsx';

const mockRepos: RepoItem[] = [
  {
    id: 'repo1',
    group: 'group1',
    branches: ['main', 'develop'],
    schedule: '0 0 * * *',
    status: 'success',
    lastSync: '2025-01-15T10:00:00Z',
  },
  {
    id: 'repo2',
    group: 'group1',
    branches: ['main'],
    schedule: '0 0 */7 * *',
    status: 'pending',
  },
  {
    id: 'repo3',
    group: 'group2',
    branches: ['main', 'release/*'],
    schedule: '0 6 * * *',
    status: 'failed',
    lastSync: '2025-01-14T06:00:00Z',
  },
];

describe('TUI Helper Functions', () => {
  describe('getStatusColor', () => {
    it('should return green for success', () => {
      expect(getStatusColor('success')).toBe('green');
    });
    
    it('should return red for failed', () => {
      expect(getStatusColor('failed')).toBe('red');
    });
    
    it('should return yellow for running', () => {
      expect(getStatusColor('running')).toBe('yellow');
    });
    
    it('should return gray for pending', () => {
      expect(getStatusColor('pending')).toBe('gray');
    });
    
    it('should return cyan for queued', () => {
      expect(getStatusColor('queued')).toBe('cyan');
    });
    
    it('should return magenta for cancelled', () => {
      expect(getStatusColor('cancelled')).toBe('magenta');
    });
  });
  
  describe('getStatusIcon', () => {
    it('should return checkmark for success', () => {
      expect(getStatusIcon('success')).toBe('✓');
    });
    
    it('should return x for failed', () => {
      expect(getStatusIcon('failed')).toBe('✗');
    });
    
    it('should return spinner for running', () => {
      expect(getStatusIcon('running')).toBe('⟳');
    });
    
    it('should return circle for pending', () => {
      expect(getStatusIcon('pending')).toBe('○');
    });
    
    it('should return half-circle for queued', () => {
      expect(getStatusIcon('queued')).toBe('◐');
    });
    
    it('should return crossed-circle for cancelled', () => {
      expect(getStatusIcon('cancelled')).toBe('⊘');
    });
  });
  
  describe('RepoItem structure', () => {
    it('should have required fields', () => {
      const repo = mockRepos[0];
      expect(repo.id).toBeDefined();
      expect(repo.group).toBeDefined();
      expect(repo.branches).toBeDefined();
      expect(repo.schedule).toBeDefined();
      expect(repo.status).toBeDefined();
    });
    
    it('should have optional lastSync', () => {
      expect(mockRepos[0].lastSync).toBeDefined();
      expect(mockRepos[1].lastSync).toBeUndefined();
    });
    
    it('should support all status types', () => {
      expect(mockRepos[0].status).toBe('success');
      expect(mockRepos[1].status).toBe('pending');
      expect(mockRepos[2].status).toBe('failed');
    });
  });
});