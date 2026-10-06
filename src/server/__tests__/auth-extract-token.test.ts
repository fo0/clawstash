import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { extractToken } from '../auth';

const withAuthorization = (value: string) =>
  new NextRequest('http://localhost:3000/api/stashes', { headers: { authorization: value } });

describe('extractToken', () => {
  it('accepts the Bearer scheme in any letter case (RFC 9110 §11.1)', () => {
    for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
      expect(extractToken(withAuthorization(`${scheme} cs_abc`))).toBe('cs_abc');
    }
  });

  it('ignores other schemes and an empty Bearer credential', () => {
    expect(extractToken(withAuthorization('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(extractToken(withAuthorization('Bearer    '))).toBeNull();
  });
});
