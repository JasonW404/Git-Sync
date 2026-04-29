import React from 'react';
import { Box, Text } from 'ink';
import type { SyncTaskStatus } from '../types/sync.js';

export interface RepoItem {
  id: string;
  group: string;
  branches: string[];
  schedule: string;
  lastSync?: string;
  status: SyncTaskStatus;
}

export interface TuiProps {
  repos: RepoItem[];
  onRepoSelect?: (repoId: string) => void;
  onSync?: (repoId: string) => void;
  onRefresh?: () => void;
}

export function RepoList({ repos, selectedId }: { repos: RepoItem[]; selectedId?: string }) {
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Repository List</Text>
      </Box>
      <Box flexDirection="column" paddingX={2}>
        {repos.map((repo) => (
          <RepoRow key={repo.id} repo={repo} isSelected={repo.id === selectedId} />
        ))}
      </Box>
    </Box>
  );
}

export function RepoRow({ repo, isSelected }: { repo: RepoItem; isSelected: boolean }) {
  const statusColor = getStatusColor(repo.status);
  const prefix = isSelected ? '❯ ' : '  ';
  
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'white'}>{prefix}</Text>
      <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'}>
        {repo.id}
      </Text>
      <Text color="gray"> ({repo.group})</Text>
      <Text color="cyan"> [{repo.branches.join(', ')}]</Text>
      <Text color={statusColor}> {getStatusIcon(repo.status)}</Text>
    </Box>
  );
}

export function StatusPanel({ repo }: { repo: RepoItem }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor="green" paddingX={1}>
        <Text bold color="green">Status: {repo.id}</Text>
      </Box>
      <Box flexDirection="column" paddingX={2}>
        <Text>Group: <Text color="cyan">{repo.group}</Text></Text>
        <Text>Branches: <Text color="cyan">{repo.branches.join(', ')}</Text></Text>
        <Text>Schedule: <Text color="yellow">{repo.schedule}</Text></Text>
        <Text>Status: <Text color={getStatusColor(repo.status)}>{repo.status}</Text></Text>
        {repo.lastSync && (
          <Text>Last Sync: <Text color="gray">{repo.lastSync}</Text></Text>
        )}
      </Box>
    </Box>
  );
}

export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const width = 40;
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;
  
  return (
    <Box>
      <Text color="cyan">{label}: </Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text color="cyan"> {progress}%</Text>
    </Box>
  );
}

export function SyncInProgress({ repoId, phase, progress }: { 
  repoId: string; 
  phase: string; 
  progress: number 
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow">Syncing: {repoId}</Text>
      </Box>
      <Box flexDirection="column" paddingX={2}>
        <Text>Phase: <Text color="yellow">{phase}</Text></Text>
        <ProgressBar progress={progress} label="Progress" />
      </Box>
    </Box>
  );
}

export function Header({ version }: { version: string }) {
  return (
    <Box borderStyle="double" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Git-Sync Dashboard</Text>
      <Text color="gray"> v{version}</Text>
    </Box>
  );
}

export function Footer({ message }: { message?: string }) {
  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="gray">Press q to quit | r to refresh | s to sync selected</Text>
      {message && <Text color="yellow"> | {message}</Text>}
    </Box>
  );
}

export function Dashboard({ repos }: { repos: RepoItem[] }) {
  const [selectedId, _setSelectedId] = React.useState<string | undefined>(
    repos.length > 0 ? repos[0].id : undefined
  );
  
  const selectedRepo = repos.find(r => r.id === selectedId);
  
  React.useEffect(() => {
    const handleInput = (data: Buffer) => {
      const key = data.toString();
      if (key === 'q') {
        process.exit(0);
      }
    };
    const stdin = process.stdin;
    stdin.on('data', handleInput);
    return () => { stdin.off('data', handleInput); };
  }, []);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Header version="1.0.0" />
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" width="50%">
          <RepoList repos={repos} selectedId={selectedId} />
        </Box>
        <Box flexDirection="column" width="50%">
          {selectedRepo && <StatusPanel repo={selectedRepo} />}
        </Box>
      </Box>
      <Footer />
    </Box>
  );
}

export function getStatusColor(status: SyncTaskStatus): string {
  switch (status) {
    case 'success': return 'green';
    case 'failed': return 'red';
    case 'running': return 'yellow';
    case 'pending': return 'gray';
    case 'queued': return 'cyan';
    case 'cancelled': return 'magenta';
    default: return 'gray';
  }
}

export function getStatusIcon(status: SyncTaskStatus): string {
  switch (status) {
    case 'success': return '✓';
    case 'failed': return '✗';
    case 'running': return '⟳';
    case 'pending': return '○';
    case 'queued': return '◐';
    case 'cancelled': return '⊘';
    default: return '?';
  }
}

export default Dashboard;