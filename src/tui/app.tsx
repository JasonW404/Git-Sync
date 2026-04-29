import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { readFileSync, existsSync } from 'fs';
import { execa } from 'execa';
import type { SyncTaskStatus } from '../types/sync.js';

export interface RepoState {
  repo_id: string;
  last_sync_hash: string | null;
  last_sync_time: string | null;
  sync_phase: string;
  failure_count: number;
  last_error: string | null;
}

export interface SyncLogEntry {
  id: number;
  repo_id: string;
  sync_time: string;
  status: 'success' | 'failed' | 'partial';
  commits_synced: number;
  commits_rewritten: number;
  branches_synced: string;
  duration_ms: number;
  error_message: string | null;
}

export interface ConfigRepo {
  id: string;
  group: string;
  branches: string[];
  schedule: string;
}

export function TuiApp({ configPath, statePath }: { configPath: string; statePath?: string }) {
  const { exit } = useApp();
  const [repos, setRepos] = useState<ConfigRepo[]>([]);
  const [states, setStates] = useState<Map<string, RepoState>>(new Map());
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const dbPath = statePath || '/app/state/state.db';

  useEffect(() => {
    loadConfig();
    loadState();
    const interval = setInterval(loadState, 5000);
    return () => clearInterval(interval);
  }, [configPath, dbPath]);

  useInput((input, key) => {
    if (syncing) return;

    if (input === 'q' || key.escape) {
      exit();
    } else if (input === 'r') {
      refresh();
    } else if (input === 'j' || key.downArrow) {
      setSelected(Math.min(selected + 1, repos.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelected(Math.max(selected - 1, 0));
    } else if (input === 's') {
      syncSelected();
    } else if (input === 'a') {
      syncAll();
    }
  });

  async function loadConfig() {
    try {
      if (!existsSync(configPath)) {
        setError(`Config not found: ${configPath}`);
        setLoading(false);
        return;
      }

      const content = readFileSync(configPath, 'utf-8');
      const yaml = await import('js-yaml');
      const config = yaml.load(content) as any;

      const repoList: ConfigRepo[] = [];
      for (const group of config.sync_tasks || []) {
        for (const repo of group.repos || []) {
          repoList.push({
            id: repo.id,
            group: group.name,
            branches: repo.branches || ['main'],
            schedule: group.schedule || config.settings?.default_schedule || '0 0 */7 * *',
          });
        }
      }
      setRepos(repoList);
      setLoading(false);
    } catch (e: any) {
      setError(`Config error: ${e.message}`);
      setLoading(false);
    }
  }

  function loadState() {
    if (!existsSync(dbPath)) return;

    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);

      const stateRows = db.prepare('SELECT * FROM sync_state').all() as RepoState[];
      const stateMap = new Map<string, RepoState>();
      for (const row of stateRows) {
        stateMap.set(row.repo_id, row);
      }
      setStates(stateMap);

      const logRows = db.prepare('SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 20').all() as SyncLogEntry[];
      setLogs(logRows);

      db.close();
    } catch {
      // Database not ready or doesn't exist yet
    }
  }

  async function refresh() {
    setRefreshing(true);
    await loadConfig();
    loadState();
    setRefreshing(false);
  }

  async function syncSelected() {
    if (repos.length === 0 || syncing) return;
    const repo = repos[selected];
    setSyncing(repo.id);
    setSyncProgress('Starting sync...');

    try {
      const result = await execa('node', ['dist/cli.cjs', 'sync', '-c', configPath, '-r', repo.id], {
        cwd: process.cwd(),
      });
      setSyncProgress('Sync complete');
      loadState();
    } catch (e: any) {
      setSyncProgress(`Error: ${e.message}`);
    }

    setTimeout(() => {
      setSyncing(null);
      setSyncProgress('');
    }, 2000);
  }

  async function syncAll() {
    if (repos.length === 0 || syncing) return;
    setSyncing('all');
    setSyncProgress('Syncing all repos...');

    try {
      await execa('node', ['dist/cli.cjs', 'sync', '-c', configPath], {
        cwd: process.cwd(),
      });
      setSyncProgress('All syncs complete');
      loadState();
    } catch (e: any) {
      setSyncProgress(`Error: ${e.message}`);
    }

    setTimeout(() => {
      setSyncing(null);
      setSyncProgress('');
    }, 2000);
  }

  function getStatusColor(status: SyncTaskStatus | string): string {
    if (status === 'success') return 'green';
    if (status === 'failed') return 'red';
    if (status === 'running' || status === 'syncing') return 'yellow';
    if (status === 'queued') return 'cyan';
    return 'gray';
  }

  function getStatusIcon(status: SyncTaskStatus | string): string {
    if (status === 'success') return '✓';
    if (status === 'failed') return '✗';
    if (status === 'running' || status === 'syncing') return '⟳';
    if (status === 'queued') return '◐';
    return '○';
  }

  function formatTime(time: string | null): string {
    if (!time) return 'Never';
    const date = new Date(time);
    return date.toLocaleString();
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading configuration...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{error}</Text>
        <Text color="gray">Press q to quit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Git-Sync Dashboard</Text>
        {refreshing && <Text color="yellow"> (Refreshing...)</Text>}
      </Box>

      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width="50%">
          <Box borderStyle="round" borderColor="blue" paddingX={1}>
            <Text bold color="blue">Repositories ({repos.length})</Text>
          </Box>
          <Box flexDirection="column" paddingX={1}>
            {repos.map((repo, idx) => {
              const state = states.get(repo.id);
              const status = syncing === repo.id ? 'syncing' : (state?.sync_phase || 'pending');
              const isSelected = idx === selected;
              const isSyncingThis = syncing === repo.id;

              return (
                <Box key={repo.id}>
                  <Text color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                  <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'}>
                    {repo.id}
                  </Text>
                  <Text color="gray"> ({repo.group})</Text>
                  <Text color={getStatusColor(status)}>
                    {' '}
                    {isSyncingThis ? <Spinner type="dots" /> : getStatusIcon(status)}
                  </Text>
                </Box>
              );
            })}
            {repos.length === 0 && (
              <Text color="gray">No repos configured</Text>
            )}
          </Box>
        </Box>

        <Box flexDirection="column" width="50%">
          {repos[selected] && (
            <Box flexDirection="column">
              <Box borderStyle="round" borderColor="green" paddingX={1}>
                <Text bold color="green">Details: {repos[selected].id}</Text>
              </Box>
              <Box flexDirection="column" paddingX={1}>
                <Text>Group: <Text color="cyan">{repos[selected].group}</Text></Text>
                <Text>Branches: <Text color="cyan">{repos[selected].branches.join(', ')}</Text></Text>
                <Text>Schedule: <Text color="yellow">{repos[selected].schedule}</Text></Text>

                {states.get(repos[selected].id) && (
                  <>
                    <Text>Last Sync: <Text color="gray">
                      {formatTime(states.get(repos[selected].id)?.last_sync_time)}
                    </Text></Text>
                    <Text>Status: <Text color={getStatusColor(states.get(repos[selected].id)?.sync_phase || 'pending')}>
                      {states.get(repos[selected].id)?.sync_phase}
                    </Text></Text>
                    {states.get(repos[selected].id)?.failure_count > 0 && (
                      <Text color="red">Failures: {states.get(repos[selected].id)?.failure_count}</Text>
                    )}
                    {states.get(repos[selected].id)?.last_error && (
                      <Text color="red">Error: {states.get(repos[selected].id)?.last_error}</Text>
                    )}
                  </>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {syncing && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            <Spinner type="dots" /> {syncProgress}
          </Text>
        </Box>
      )}

      {logs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor="magenta" paddingX={1}>
            <Text bold color="magenta">Recent Sync Logs</Text>
          </Box>
          <Box flexDirection="column" paddingX={1}>
            {logs.slice(0, 5).map((log) => (
              <Box key={log.id}>
                <Text color={log.status === 'success' ? 'green' : 'red'}>
                  {log.status === 'success' ? '✓' : '✗'}
                </Text>
                <Text color="white"> {log.repo_id}</Text>
                <Text color="gray"> {formatTime(log.sync_time)}</Text>
                <Text color="cyan"> ({log.duration_ms}ms)</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          j/k: navigate | s: sync selected | a: sync all | r: refresh | q: quit
        </Text>
      </Box>
    </Box>
  );
}

export default TuiApp;