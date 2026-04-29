import { writeFileSync } from 'fs';
import type { AuthorMapping } from '../types/config.js';

export function generateMailmap(mappings: AuthorMapping[]): string {
  if (mappings.length === 0) {
    return '';
  }
  
  const lines = mappings.map(
    (m) => `${m.internal_name} <${m.internal_email}> <${m.match_email}>`
  );
  
  return lines.join('\n');
}

export function parseMailmap(content: string): AuthorMapping[] {
  if (!content.trim()) {
    return [];
  }
  
  const lines = content.split('\n').filter((line) => line.trim());
  const mappings: AuthorMapping[] = [];
  
  for (const line of lines) {
    const match = line.match(/^([^<]+)\s*<([^>]+)>\s*<([^>]+)>$/);
    if (match) {
      mappings.push({
        internal_name: match[1].trim(),
        internal_email: match[2],
        match_email: match[3],
      });
    }
  }
  
  return mappings;
}

export function writeMailmapToFile(mappings: AuthorMapping[], filePath: string): void {
  const content = generateMailmap(mappings);
  writeFileSync(filePath, content, 'utf-8');
}