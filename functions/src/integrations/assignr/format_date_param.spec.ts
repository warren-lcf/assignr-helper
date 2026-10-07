import { describe, expect, it } from 'vitest';
import { format_date_param } from './format_date_param.js';

describe('format_date_param', () => {
  it('formats the UTC calendar date', () => {
    expect(format_date_param(Date.UTC(2026, 9, 7, 23, 59, 59))).toBe('2026-10-07');
    expect(format_date_param(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});
