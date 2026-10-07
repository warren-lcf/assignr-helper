import { describe, expect, it } from 'vitest';
import { extract_bearer_token } from './extract_bearer_token.js';

describe('extract_bearer_token', () => {
  it('reads the token, ignoring the scheme case and surrounding space', () => {
    expect(extract_bearer_token('Bearer abc.def')).toBe('abc.def');
    expect(extract_bearer_token('bearer   abc')).toBe('abc');
    expect(extract_bearer_token('  BEARER abc  ')).toBe('abc');
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc', 'Bearer a b', ['Bearer abc']])(
    'rejects %j',
    (value) => {
      expect(extract_bearer_token(value as string | undefined)).toBeNull();
    },
  );
});
