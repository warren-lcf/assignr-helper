import { describe, expect, it } from 'vitest';
import { format_digest_fee } from './format_digest_fee.js';

describe('format_digest_fee', () => {
  it('returns null without a fee or currency', () => {
    expect(format_digest_fee(null, 'USD', 'en-US')).toBeNull();
    expect(format_digest_fee(5000, null, 'en-US')).toBeNull();
  });

  it('formats minor units as major currency', () => {
    expect(format_digest_fee(5000, 'USD', 'en-US')).toBe('$50.00');
    expect(format_digest_fee(0, 'USD', 'en-US')).toBe('$0.00');
  });

  it('respects currencies without minor units', () => {
    expect(format_digest_fee(5000, 'JPY', 'en-US')).toContain('5,000');
  });

  it('falls back to amount and code for an invalid currency', () => {
    expect(format_digest_fee(1234, 'NOT_A_CODE', 'en-US')).toBe('12.34 NOT_A_CODE');
  });
});
