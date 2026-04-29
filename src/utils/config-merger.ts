import type { AuthorMapping, RepoConfig } from '../types/config.js';

export function mergeMappings(
  globalMappings: AuthorMapping[],
  localMappings?: AuthorMapping[]
): AuthorMapping[] {
  if (!localMappings || localMappings.length === 0) {
    return globalMappings;
  }
  
  const merged = [...globalMappings];
  
  for (const local of localMappings) {
    const existingIndex = merged.findIndex(
      (m) => m.match_email === local.match_email
    );
    
    if (existingIndex >= 0) {
      merged[existingIndex] = local;
    } else {
      merged.push(local);
    }
  }
  
  return merged;
}

export function getMergedRepoConfig(
  repo: RepoConfig,
  globalMappings: AuthorMapping[]
): RepoConfig & { mergedMappings: AuthorMapping[] } {
  return {
    ...repo,
    mergedMappings: mergeMappings(globalMappings, repo.author_mappings),
  };
}

export function findMappingForEmail(
  email: string,
  mappings: AuthorMapping[]
): AuthorMapping | undefined {
  return mappings.find((m) => m.match_email === email);
}

export function getUnmappedEmails(
  emails: string[],
  mappings: AuthorMapping[]
): string[] {
  return emails.filter((email) => !findMappingForEmail(email, mappings));
}