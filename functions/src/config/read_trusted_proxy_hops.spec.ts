import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUSTED_PROXY_HOPS, read_trusted_proxy_hops } from './read_trusted_proxy_hops.js';

describe('read_trusted_proxy_hops', () => {
  it.each([[undefined], [''], ['   ']])('defaults when the variable is %j', (value) => {
    expect(read_trusted_proxy_hops({ TRUSTED_PROXY_HOPS: value })).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    [' 3 ', 3],
    ['5', 5],
  ])('reads %j as %d', (value, expected) => {
    expect(read_trusted_proxy_hops({ TRUSTED_PROXY_HOPS: value })).toBe(expected);
  });

  it.each([['6'], ['-1'], ['1.5'], ['two'], ['10'], ['0x1']])('refuses %j', (value) => {
    expect(() => read_trusted_proxy_hops({ TRUSTED_PROXY_HOPS: value })).toThrow(
      'TRUSTED_PROXY_HOPS',
    );
  });
});
