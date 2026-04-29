import { describe, it, expect } from 'vitest';
import { generateMailmap, parseMailmap } from './mailmap-generator.ts';
import type { AuthorMapping } from '../types/config.ts';

describe('generateMailmap', () => {
  it('should generate empty string for empty mappings', () => {
    const result = generateMailmap([]);
    expect(result).toBe('');
  });

  it('should generate correct mailmap format', () => {
    const mappings: AuthorMapping[] = [
      {
        match_email: 'alice@example.com',
        internal_name: 'Alice Wang',
        internal_email: 'alice@internal.corp',
      },
    ];
    const result = generateMailmap(mappings);
    expect(result).toBe('Alice Wang <alice@internal.corp> <alice@example.com>');
  });

  it('should handle multiple mappings', () => {
    const mappings: AuthorMapping[] = [
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
    const result = generateMailmap(mappings);
    expect(result).toBe(
      'Alice Wang <alice@internal.corp> <alice@example.com>\n' +
      'Bob Zhang <bob.zhang@internal.corp> <bob@gmail.com>'
    );
  });
});

describe('parseMailmap', () => {
  it('should parse empty content', () => {
    const result = parseMailmap('');
    expect(result).toEqual([]);
  });

  it('should parse single mapping', () => {
    const content = 'Alice Wang <alice@internal.corp> <alice@example.com>';
    const result = parseMailmap(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      internal_name: 'Alice Wang',
      internal_email: 'alice@internal.corp',
      match_email: 'alice@example.com',
    });
  });

  it('should parse multiple mappings', () => {
    const content = 
      'Alice Wang <alice@internal.corp> <alice@example.com>\n' +
      'Bob Zhang <bob.zhang@internal.corp> <bob@gmail.com>';
    const result = parseMailmap(content);
    expect(result).toHaveLength(2);
  });

  it('should ignore invalid lines', () => {
    const content = 'invalid line\nAlice Wang <alice@internal.corp> <alice@example.com>';
    const result = parseMailmap(content);
    expect(result).toHaveLength(1);
  });
});