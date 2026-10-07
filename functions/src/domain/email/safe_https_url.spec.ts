import { describe, expect, it } from 'vitest';
import { safe_https_url } from './safe_https_url.js';

describe('safe_https_url', () => {
  it('accepts and normalises https URLs', () => {
    expect(safe_https_url('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safe_https_url('  https://example.com  ')).toBe('https://example.com/');
  });

  it('returns null for null', () => {
    expect(safe_https_url(null)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',
    'ftp://example.com',
    '//example.com',
    '/relative/path',
    'not a url',
    '',
  ])('rejects %s', (candidate) => {
    expect(safe_https_url(candidate)).toBeNull();
  });

  it('rejects embedded credentials', () => {
    expect(safe_https_url('https://user:pass@example.com')).toBeNull();
    expect(safe_https_url('https://user@example.com')).toBeNull();
  });
});
