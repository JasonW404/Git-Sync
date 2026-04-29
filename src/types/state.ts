import { z } from 'zod';

export const SyncPhaseSchema = z.enum([
  'idle',
  'init',
  'fetching',
  'rewriting',
  'pushing',
  'complete',
  'failed',
]);

export const SyncStateSchema = z.object({
  repo_id: z.string(),
  last_sync_hash: z.string().nullable(),
  last_sync_time: z.date().nullable(),
  sync_phase: SyncPhaseSchema,
  failure_count: z.number().int().min(0),
  last_error: z.string().nullable(),
});

export const CommitMappingSchema = z.object({
  repo_id: z.string(),
  github_hash: z.string(),
  internal_hash: z.string(),
  author_email: z.string().email(),
  rewritten_email: z.string().email(),
  sync_time: z.date(),
});

export const SyncLogStatusSchema = z.enum(['success', 'failed', 'partial']);

export const SyncLogSchema = z.object({
  repo_id: z.string(),
  sync_time: z.date(),
  status: SyncLogStatusSchema,
  commits_synced: z.number().int().min(0),
  commits_rewritten: z.number().int().min(0),
  branches_synced: z.array(z.string()),
  duration_ms: z.number().int().min(0),
  error_message: z.string().nullable(),
  details: z.record(z.unknown()).optional(),
});

export const BackupRecordSchema = z.object({
  repo_id: z.string(),
  backup_tag: z.string(),
  created_at: z.date(),
  expires_at: z.date(),
});

export type SyncPhase = z.infer<typeof SyncPhaseSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export type CommitMapping = z.infer<typeof CommitMappingSchema>;
export type SyncLogStatus = z.infer<typeof SyncLogStatusSchema>;
export type SyncLog = z.infer<typeof SyncLogSchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;