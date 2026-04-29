import { z } from 'zod';

const GitUrlSchema = z.string().refine(
  (val) => {
    // Local path format: /path/to/repo
    if (val.startsWith('/')) {
      return true;
    }
    // SSH format: git@host:path
    if (val.startsWith('git@')) {
      return /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(\.git)?$/.test(val);
    }
    // HTTPS format: https://host/path
    if (val.startsWith('https://') || val.startsWith('http://')) {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  },
  { message: 'Must be a valid Git URL (SSH, HTTPS, or local path starting with /)' }
);

export const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);

export const RetryConfigSchema = z.object({
  max_attempts: z.number().int().min(1).default(5),
  initial_delay: z.string().default('1s'),
  max_delay: z.string().default('30s'),
  factor: z.number().positive().default(2.0),
});

export const UnmappedAuthorPolicySchema = z.enum(['warn', 'reject']);

export const SettingsSchema = z.object({
  state_dir: z.string().default('/app/state'),
  repo_dir: z.string().default('/app/repos'),
  log_level: LogLevelSchema.default('INFO'),
  max_concurrent: z.number().int().min(1).max(10).default(5),
  default_schedule: z.string().default('0 0 */7 * *'),
  timezone: z.string().default('Asia/Shanghai'),
  retry: RetryConfigSchema.optional(),
  unmapped_author_policy: UnmappedAuthorPolicySchema.default('warn'),
});

export const AuthorMappingSchema = z.object({
  match_email: z.string().email(),
  internal_name: z.string().min(1),
  internal_email: z.string().email(),
});

export const AuthMethodSchema = z.enum(['ssh', 'https']);

export const GitHubAuthSchema = z.object({
  method: AuthMethodSchema.optional(),
  token: z.string().optional(),
  username: z.string().optional(),
});

export const InternalAuthSchema = z.object({
  method: AuthMethodSchema.optional(),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const AuthTypeSchema = z.enum(['ssh', 'https', 'mixed']);

export const AuthConfigSchema = z.object({
  type: AuthTypeSchema,
  github: GitHubAuthSchema.optional(),
  internal: InternalAuthSchema.optional(),
});

export const RepoConfigSchema = z.object({
  id: z.string().min(1),
  github_url: GitUrlSchema,
  internal_url: GitUrlSchema,
  branches: z.array(z.string()).min(1),
  tags: z.boolean().optional().default(false),
  depth: z.number().int().min(0).optional().default(0),
  auth: AuthConfigSchema,
  author_mappings: z.array(AuthorMappingSchema).optional(),
});

export const SyncTaskGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  schedule: z.string().optional(),
  repos: z.array(RepoConfigSchema).min(1),
});

export const GitSyncConfigSchema = z.object({
  version: z.literal(1),
  settings: SettingsSchema,
  author_mappings: z.array(AuthorMappingSchema).optional().default([]),
  sync_tasks: z.array(SyncTaskGroupSchema).min(1),
});

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type UnmappedAuthorPolicy = z.infer<typeof UnmappedAuthorPolicySchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type AuthorMapping = z.infer<typeof AuthorMappingSchema>;
export type AuthMethod = z.infer<typeof AuthMethodSchema>;
export type GitHubAuth = z.infer<typeof GitHubAuthSchema>;
export type InternalAuth = z.infer<typeof InternalAuthSchema>;
export type AuthType = z.infer<typeof AuthTypeSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type SyncTaskGroup = z.infer<typeof SyncTaskGroupSchema>;
export type GitSyncConfig = z.infer<typeof GitSyncConfigSchema>;