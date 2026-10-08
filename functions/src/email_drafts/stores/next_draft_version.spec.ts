import { describe, expect, it } from 'vitest';
import { next_draft_version } from './next_draft_version.js';

describe('next_draft_version', () => {
  it('uses the clock when it has moved on', () => {
    expect(next_draft_version(1000, 5000)).toBe(5000);
  });

  it('moves one past the old version when the clock has not moved', () => {
    expect(next_draft_version(5000, 5000)).toBe(5001);
  });

  it('never goes backwards when the clock steps back', () => {
    expect(next_draft_version(5000, 100)).toBe(5001);
  });
});
