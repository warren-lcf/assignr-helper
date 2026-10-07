import { describe, expect, it } from 'vitest';
import { require_env } from './require_env.js';

describe('require_env', () => {
  it('returns a set variable', () => {
    expect(require_env('A', { A: 'value' })).toBe('value');
  });

  it.each([{}, { A: '' }, { A: '   ' }])('throws, naming the variable, for %j', (env) => {
    expect(() => require_env('A', env)).toThrow('Missing required environment variable A');
  });
});
