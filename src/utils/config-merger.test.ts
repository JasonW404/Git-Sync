import { describe, it, expect } from 'vitest';
import {
  mergeMappings,
  findMappingForEmail,
  getUnmappedEmails,
} from './config-merger.ts';
import type { AuthorMapping } from '../types/config.ts';

describe('mergeMappings', () => {
  const globalMappings: AuthorMapping[] = [
    {
      match_email: 'alice@example.com',
      internal_name: 'Alice Wang',
      internal_email: 'alice@internal.corp',
    },
    {
      match_email: 'bob@gmail.com',
      internal_name: 'Bob Zhang',
      internal_email: 'bob.zhang@internal.corp',
    },
  ];

  it('should return global mappings if no local mappings', () => {
    const result = mergeMappings(globalMappings);
    expect(result).toEqual(globalMappings);
  });

  it('should return global mappings if local is empty', () => {
    const result = mergeMappings(globalMappings, []);
    expect(result).toEqual(globalMappings);
  });

  it('should override global mapping with local', () => {
    const localMappings: AuthorMapping[] = [
      {
        match_email: 'alice@example.com',
        internal_name: 'Alice Wang (Team A)',
        internal_email: 'alice.team-a@internal.corp',
      },
    ];
    const result = mergeMappings(globalMappings, localMappings);
    expect(result).toHaveLength(2);
    expect(result[0].match_email).toBe('alice@example.com');
    expect(result[0].internal_name).toBe('Alice Wang (Team A)');
  });

  it('should add new local mapping', () => {
    const localMappings: AuthorMapping[] = [
      {
        match_email: 'new@external.com',
        internal_name: 'New User',
        internal_email: 'new.user@internal.corp',
      },
    ];
    const result = mergeMappings(globalMappings, localMappings);
    expect(result).toHaveLength(3);
  });
});

describe('findMappingForEmail', () => {
  const mappings: AuthorMapping[] = [
    {
      match_email: 'alice@example.com',
      internal_name: 'Alice Wang',
      internal_email: 'alice@internal.corp',
    },
  ];

  it('should find mapping for matching email', () => {
    const result = findMappingForEmail('alice@example.com', mappings);
    expect(result).toBeDefined();
    expect(result?.internal_name).toBe('Alice Wang');
  });

  it('should return undefined for non-matching email', () => {
    const result = findMappingForEmail('unknown@example.com', mappings);
    expect(result).toBeUndefined();
  });
});

describe('getUnmappedEmails', () => {
  const mappings: AuthorMapping[] = [
    {
      match_email: 'alice@example.com',
      internal_name: 'Alice Wang',
      internal_email: 'alice@internal.corp',
    },
  ];

  it('should return empty array if all mapped', () => {
    const emails = ['alice@example.com'];
    const result = getUnmappedEmails(emails, mappings);
    expect(result).toEqual([]);
  });

  it('should return unmapped emails', () => {
    const emails = ['alice@example.com', 'bob@gmail.com', 'unknown@example.com'];
    const result = getUnmappedEmails(emails, mappings);
    expect(result).toEqual(['bob@gmail.com', 'unknown@example.com']);
  });
});