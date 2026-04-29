import { z } from 'zod';

export const SyncTaskStatusSchema = z.enum([
  'pending',
  'queued',
  'running',
  'success',
  'failed',
  'cancelled',
]);

export const SyncTaskSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string(),
  status: SyncTaskStatusSchema,
  progress: z.number().min(0).max(100),
  start_time: z.date().nullable(),
  end_time: z.date().nullable(),
  error: z.string().nullable(),
  phase: z.string().optional(),
});

export const SyncResultSchema = z.object({
  repo_id: z.string(),
  status: z.enum(['success', 'failed', 'partial']),
  commits_synced: z.number().int().min(0),
  commits_rewritten: z.number().int().min(0),
  branches_synced: z.array(z.string()),
  duration_ms: z.number().int().min(0),
  error: z.string().nullable(),
});

export const SyncProgressSchema = z.object({
  phase: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type SyncTaskStatus = z.infer<typeof SyncTaskStatusSchema>;
export type SyncTask = z.infer<typeof SyncTaskSchema>;
export type SyncResult = z.infer<typeof SyncResultSchema>;
export type SyncProgress = z.infer<typeof SyncProgressSchema>;